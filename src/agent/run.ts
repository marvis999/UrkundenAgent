import { createOpenRouterProvider, type LlmProvider } from "./llm";
import { failures, fulfilled, inParallel, DEFAULT_LIMIT } from "./parallel";
import { planRun, type PlannedDocument } from "./plan";
import { prepareCandidates, type PreparedCandidate, type RejectedCandidate } from "./merge";
import { DERIVATIONS } from "./derived";
import { classifyDocument, type ClassifyResult, type DocumentFacts } from "./tasks/classifyDocument";
import { extractCandidates, inCalls, type OfferedPage } from "./tasks/extractCandidates";
import { ensureCatalog } from "@/db/cases";
import { locateDocumentQuotes, turnDocumentPage } from "@/db/pages";
import { getCaseView } from "@/db/repository";
import {
  chosenCandidate,
  finishRun,
  noteAbsences,
  notePropertyAddress,
  recordProgress,
  resolveRequestItems,
  saveCandidates,
  saveDerived,
  saveDocumentFacts,
  startRun,
  type ResolvedItem,
} from "@/db/runWriter";
import { fieldStatus, isOpen } from "@/domain/derive";
import type { FieldId } from "@/domain/model";
import { REQUEST_OUTCOME_META } from "@/domain/status";
import { canonicalize } from "@/domain/value";
import { todayIso } from "@/lib/clock";
import { plural } from "@/lib/format";

/**
 * One run of the agent loop.
 *
 * The orchestrator is code, not a model. That is the whole point: the set of calls a run
 * makes is decided here, deterministically, so the answer cache actually replays and two
 * runs over the same documents produce the same candidates. A model choosing what to read
 * next would make every run differ for no reason a clerk could see.
 *
 * Two model stages, each narrow, each fanned out:
 *
 *   1. classify   one call per document. What is it, and which page holds what.
 *   2. extract    one call per field per page bundle, routed by stage 1. The values.
 *
 * Everything after that is code: the merge checks every quote against the page it claims
 * to come from, the derivations are computed, the status rules run, and the finding under
 * a value is the rule that fired, in words the code owns. No model writes a sentence that
 * reaches the screen; it reads values and names where they stand.
 *
 * A failure in one branch is collected, not thrown. An unreadable document costs its own
 * values and nothing else, and the run log says which ones are missing.
 */

const ABSENCE_NOTE = "in den Unterlagen nicht enthalten";

/** Thrown when the clerk stops a run, so the caller can log it as a decision, not a fault. */
export class RunCancelled extends Error {
  constructor() {
    super("Durchlauf abgebrochen");
    this.name = "RunCancelled";
  }
}

export interface RunOptions {
  readonly provider?: LlmProvider;
  /** ISO today. Passed through to every stage so a run is reproducible. */
  readonly today?: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (message: string) => void;
}

export interface RunReport {
  readonly candidatesWritten: number;
  readonly subfieldsFilled: number;
  readonly rowsTouched: number;
  /** Quotes that could be pinned to one place on their page and so carry a marker. */
  readonly quotesLocated: number;
  /** Quotes that stand more than once on their page, so they mark nothing. */
  readonly quotesAmbiguous: number;
  readonly resolved: readonly ResolvedItem[];
  readonly rejected: readonly RejectedCandidate[];
  readonly failures: readonly string[];
  readonly summary: string;
}

const pageKey = (documentId: string, number: number) => `${documentId}#${number}`;

/**
 * Which fields each page can contribute to, collected across every document. A page turned
 * upright this run is offered with its new proportions, since the plan still holds the old.
 */
const routePages = (
  documents: readonly PlannedDocument[],
  classified: ReadonlyMap<string, ClassifyResult>,
  upright: ReadonlyMap<string, number>,
): Map<FieldId, OfferedPage[]> => {
  const byField = new Map<FieldId, OfferedPage[]>();
  for (const document of documents) {
    const routing = classified.get(document.id)?.routing;
    if (routing === undefined) continue;
    for (const page of document.pages) {
      const total = upright.get(pageKey(document.id, page.number));
      const offered = total !== undefined && total % 180 !== page.rotation % 180 ? { ...page, width: page.height, height: page.width } : page;
      for (const fieldKey of routing.get(page.number) ?? []) {
        byField.set(fieldKey, [
          ...(byField.get(fieldKey) ?? []),
          { documentId: document.id, fileName: document.fileName, page: offered },
        ]);
      }
    }
  }
  return byField;
};

const splitKey = (dotted: string): [FieldId, string] => {
  const [fieldKey, subfieldKey] = dotted.split(".");
  return [fieldKey as FieldId, subfieldKey ?? ""];
};

export const runCase = async (caseId: string, options: RunOptions = {}): Promise<RunReport> => {
  const provider = options.provider ?? createOpenRouterProvider();
  const today = options.today ?? todayIso();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const signal = options.signal;
  const say = options.onProgress ?? (() => {});

  /*
   * Checked between stages, not inside them. A cancelled call fails like any other and is
   * collected rather than thrown, so without this a cancelled run would walk through every
   * remaining stage failing each one and then finish -- marking its documents read. Here
   * the run stops with the run row still open, and starting again reads the same set.
   */
  const stopIfCancelled = () => {
    if (signal?.aborted === true) throw new RunCancelled();
  };

  // A subfield the catalog gained since the case was opened is written first, so the
  // extraction has somewhere to put it.
  await ensureCatalog(caseId);
  const plan = await planRun(caseId);
  const runId = await startRun(caseId, plan.number);
  say(`Durchlauf ${plan.number}: ${plural(plan.documents.length, "Datei", "Dateien")}, ${plural(plan.pageCount, "Seite", "Seiten")}`);

  const allFailures: string[] = [];

  /* ---------- 1. Classify ---------- */

  const classifyResults = await inParallel(
    plan.documents,
    async (document) => {
      const result = await classifyDocument(provider, document, { today, signal });
      await saveDocumentFacts(document.id, result.facts);
      await recordProgress(runId, document.id, document.pages.length);
      say(`  gelesen: ${document.fileName} — ${result.facts.docType}${result.cached ? " (Cache)" : ""}`);
      return { document, result };
    },
    limit,
  );
  allFailures.push(...failures(classifyResults, (index) => plan.documents[index]?.fileName ?? "?"));

  const classified = new Map<string, ClassifyResult>();
  const facts = new Map<string, DocumentFacts>();
  for (const { document, result } of fulfilled(classifyResults)) {
    classified.set(document.id, result);
    facts.set(document.id, result.facts);
  }
  const documentDate = (documentId: string) => facts.get(documentId)?.docDate ?? null;

  /* ---------- Upright pages ---------- */

  stopIfCancelled();
  /*
   * A scan that lies on its side is turned before anything reads values off it, so the
   * rectangles the extraction returns and the picture they are drawn on are the same
   * picture. The classification saw the image as stored, so its answer is the turn still
   * missing; the page is rendered again from the original with the total, in place, and
   * the answer cache misses on the new bytes by itself. The picture gets a veto: a quarter
   * turn on a page whose text visibly runs in rows is a model's mistake, not a scan's.
   */
  const upright = new Map<string, number>();
  for (const { document, result } of fulfilled(classifyResults)) {
    for (const page of document.pages) {
      const turn = result.rotations.get(page.number) ?? 0;
      if (turn === 0 || page.imagePath === null) continue;
      if ((await turnDocumentPage(caseId, document.id, page.number, turn)) === "turned") {
        upright.set(pageKey(document.id, page.number), (page.rotation + turn) % 360);
        say(`  gedreht: ${document.fileName}, Seite ${page.number}, um ${turn}°`);
      } else {
        say(`  nicht gedreht: ${document.fileName}, Seite ${page.number} — der Text läuft schon in Zeilen`);
      }
    }
  }

  /* ---------- 2. Extract ---------- */

  stopIfCancelled();
  const byField = routePages(plan.documents, classified, upright);
  const jobs = [...byField].flatMap(([fieldKey, offered]) =>
    inCalls(offered).map((chunk) => ({ fieldKey, chunk })),
  );
  say(`  ${plural(jobs.length, "Extraktion", "Extraktionen")} über ${byField.size} Felder`);

  const extractResults = await inParallel(
    jobs,
    async (job) => {
      const result = await extractCandidates(provider, job.fieldKey, job.chunk, { signal });
      say(`  ${job.fieldKey}: ${plural(result.candidates.length, "Fundstelle", "Fundstellen")}${result.cached ? " (Cache)" : ""}`);
      return result;
    },
    limit,
  );
  allFailures.push(...failures(extractResults, (index) => `Extraktion ${jobs[index]?.fieldKey ?? "?"}`));

  /* ---------- Merge: the checks the code owns ---------- */

  stopIfCancelled();
  const rejected: RejectedCandidate[] = [];
  let candidatesWritten = 0;
  let subfieldsFilled = 0;
  let rowsTouched = 0;

  const preparedByField = new Map<FieldId, PreparedCandidate[]>();
  for (const result of fulfilled(extractResults)) {
    const { prepared, rejected: dropped } = prepareCandidates({
      fieldKey: result.fieldKey,
      offered: result.offered,
      candidates: result.candidates,
      facts,
    });
    rejected.push(...dropped);
    preparedByField.set(result.fieldKey, [...(preparedByField.get(result.fieldKey) ?? []), ...prepared]);
  }

  // Written field by field, so one field's constraint violation cannot lose another's.
  for (const [fieldKey, prepared] of preparedByField) {
    const report = await saveCandidates(caseId, plan.number, fieldKey, prepared, documentDate);
    candidatesWritten += report.written;
    subfieldsFilled += report.subfieldsFilled;
    rowsTouched += report.rowsTouched;
  }

  /* ---------- Marking the quotes on the page ---------- */

  /*
   * Now that the quotes are rows, each one is looked up in the page it names and turned
   * into a region on the page image. It happens here and not at ingest because at ingest
   * there is nothing to locate yet, and not in the model call because the model is never
   * asked where something sits -- only what it read. A quote that is found exactly once
   * gets a marker; one that is found twice pins nothing and gets none.
   */
  let quotesLocated = 0;
  let quotesAmbiguous = 0;
  const locateResults = await inParallel(
    plan.documents,
    async (document) => locateDocumentQuotes(caseId, document.id),
    limit,
  );
  allFailures.push(...failures(locateResults, (index) => `Fundstellen markieren ${plan.documents[index]?.fileName ?? "?"}`));
  for (const result of fulfilled(locateResults)) {
    quotesLocated += result.quotesLocated;
    quotesAmbiguous += result.quotesAmbiguous;
  }
  say(`  ${plural(quotesLocated, "Fundstelle", "Fundstellen")} auf der Seite markiert`);

  /* ---------- Derived values ---------- */

  for (const derivation of DERIVATIONS) {
    const [sourceField, sourceKey] = splitKey(derivation.source);
    const [targetField, targetKey] = splitKey(derivation.target);
    const source = await chosenCandidate(caseId, sourceField, sourceKey);
    if (source === undefined) continue;
    const value = derivation.compute(source.value);
    if (value === null) continue;
    await saveDerived(caseId, plan.number, {
      fieldKey: targetField,
      targetSubfieldKey: targetKey,
      sourceCandidateId: source.id,
      value,
      canonicalValue: canonicalize(value, "text"),
      sourceLabel: derivation.sourceLabel,
      rationale: derivation.rationale(source.value, value),
    });
  }

  await noteAbsences(caseId, ABSENCE_NOTE);

  /* ---------- The file's name ---------- */

  // The address the case is filed under is the value behind "Anschrift des Objekts": read
  // off a document with a Fundstelle like every other value, and written once -- see
  // `notePropertyAddress`. Not the register's plot description, which is not an address.
  const address = await chosenCandidate(caseId, "parcels", "address");
  if (address !== undefined) {
    await notePropertyAddress(caseId, address.value);
    say(`  Objekt: ${address.value}`);
  }

  /* ---------- What the run did to the open request ---------- */

  const resolved = await resolveRequestItems(caseId, plan.number);
  for (const item of resolved) say(`  Anforderung ${item.fieldKey}: ${REQUEST_OUTCOME_META[item.outcome].label}`);

  /* ---------- Close ---------- */

  // Read back through the same function the pages use, so the run log and the badges agree.
  const fields = (await getCaseView(caseId))?.fields ?? [];
  const open = fields.filter((field) => isOpen(fieldStatus(field))).length;
  /*
   * The summary is the run log, and the run log is where a clerk finds out what the run
   * did *not* keep. A discarded candidate is the most interesting thing the merge does --
   * a value whose quote was not on the page it named -- and saying nothing about it makes
   * a silent loss look like a document that held nothing.
   */
  const summary = [
    `${plural(plan.documents.length, "Datei", "Dateien")} gelesen`,
    `${plural(plan.pageCount, "Seite", "Seiten")}`,
    `${plural(candidatesWritten, "Fundstelle", "Fundstellen")}`,
    ...(upright.size === 0 ? [] : [`${plural(upright.size, "Seite", "Seiten")} aufrecht gedreht`]),
    ...(rejected.length === 0 ? [] : [`${rejected.length} Angaben verworfen`]),
    ...(quotesAmbiguous === 0 ? [] : [`${quotesAmbiguous} Zitate nicht eindeutig`]),
    `${open} von ${fields.length} Feldern offen`,
  ].join(", ");

  await finishRun(runId, caseId, summary);

  return { candidatesWritten, subfieldsFilled, rowsTouched, quotesLocated, quotesAmbiguous, resolved, rejected, failures: allFailures, summary };
};
