import { createHash } from "node:crypto";
import type { RawCandidate, OfferedPage } from "./tasks/extractCandidates";
import type { DocumentFacts } from "./tasks/classifyDocument";
import { fieldDefinition } from "@/catalog/fields";
import type { FieldId, Rect } from "@/domain/model";
import type { SourceClass } from "@/domain/status";
import { canonicalize, type ValueType } from "@/domain/value";
import { formatDate } from "@/lib/format";

/**
 * Checking the model's homework.
 *
 * Everything a model claims passes through here before it can become a row, and the
 * checks are the ones the plan says the code enforces rather than the prompt:
 *
 *  - a candidate on a text page must quote that page verbatim, or it is discarded. This
 *    is the guard against a fluent, well-formatted, entirely invented answer; a summary
 *    that reads like a quote does not survive it.
 *  - a `redacted` candidate carries no value and an `extracted` one must, because the
 *    database rejects the other combinations and a run must not die on a CHECK.
 *  - the canonical form is written here, once, from the subfield's value type. Without
 *    it "2.060.000 EUR" and "2.060.000,00 EUR" would read as a contradiction.
 *
 * Nothing here decides which value wins. It only decides which claims are admissible.
 */

export interface PreparedCandidate {
  readonly id: string;
  readonly fieldKey: FieldId;
  /** Exactly one of these is set, mirroring the CHECK on the candidate table. */
  readonly subfieldKey: string | null;
  readonly rowNaturalKey: string | null;
  /** Row content, for a table candidate. */
  readonly cells: Readonly<Record<string, string>>;
  readonly value: string | null;
  readonly canonicalValue: string | null;
  readonly tag: "extracted" | "redacted";
  readonly documentId: string;
  readonly page: number;
  readonly quote: string | null;
  readonly sourceLabel: string;
  readonly note: string | null;
  readonly sourceClass: SourceClass;
  /** Fractions of the page, for an image page; null where a quote pins the place instead. */
  readonly crop: Rect | null;
  readonly confidence: number;
  readonly readings: readonly { value: string; probability: number }[] | null;
  readonly rationale: string;
}

export interface RejectedCandidate {
  readonly fieldKey: FieldId;
  readonly target: string;
  readonly reason: string;
}

export interface MergeInput {
  readonly fieldKey: FieldId;
  readonly offered: readonly OfferedPage[];
  readonly candidates: readonly RawCandidate[];
  /** Classification of each document, for the source label and the source class. */
  readonly facts: ReadonlyMap<string, DocumentFacts>;
}

export interface MergeOutput {
  readonly prepared: readonly PreparedCandidate[];
  readonly rejected: readonly RejectedCandidate[];
}

/* ---------- Quote verification ---------- */

/**
 * Whitespace is not evidence. A PDF text layer breaks lines mid-sentence and pads with
 * runs of spaces, so a quote that is right in every character but the spacing is a
 * correct quote. Everything else -- a changed digit, a corrected spelling, a summary --
 * still fails.
 */
const squash = (raw: string) => raw.replace(/\s+/g, " ").trim();

const isVerbatim = (quote: string, pageText: string) => squash(pageText).includes(squash(quote));

/* ---------- Identity ---------- */

/**
 * A candidate's id is derived from what it says and where it says it, so extracting the
 * same page twice produces the same row rather than a second one. That is what makes a
 * run safe to repeat after a crash.
 */
const candidateId = (parts: readonly (string | number | null)[]) =>
  `c-${createHash("sha256").update(parts.map((part) => String(part ?? "")).join("\0")).digest("hex").slice(0, 24)}`;

/* ---------- Display strings the code owns ---------- */

/**
 * "Grundbuchauszug 15.11.2011, S. 2". Built here so every card reads the same way. The type
 * is one of a fixed list; a file that fits none is named by its file name.
 */
const sourceLabel = (facts: DocumentFacts, fileName: string, page: number) =>
  `${facts.docType === "Sonstiges" ? fileName : facts.docType} ${formatDate(facts.docDate)}, S. ${page}`;

/** Short label on the card. The tag is the fallback, so nothing here needs to guess. */
const noteFor = (hasPageText: boolean, sourceClass: SourceClass): string | null => {
  if (!hasPageText) return "Bildlesung";
  return sourceClass === "partyStatement" ? "unbestätigt" : null;
};

const valueTypeOf = (fieldKey: FieldId, subfieldKey: string | null): ValueType =>
  fieldDefinition(fieldKey)?.subfields.find((subfield) => subfield.key === subfieldKey)?.valueType ?? "text";

const cellsToRecord = (cells: readonly { column: string; value: string }[]): Record<string, string> =>
  Object.fromEntries(cells.map((cell) => [cell.column, cell.value]));

/* ---------- The pass ---------- */

const CONFIDENCE_FLOOR = 0;
const CONFIDENCE_CEILING = 1;

const clamp = (value: number) => Math.min(CONFIDENCE_CEILING, Math.max(CONFIDENCE_FLOOR, value));

const GRID = 1000;

/** The model's box on its 0..1000 grid, as fractions of the page. */
const fromBox = (box: { ymin: number; xmin: number; ymax: number; xmax: number }): Rect => ({
  x: box.xmin / GRID,
  y: box.ymin / GRID,
  w: (box.xmax - box.xmin) / GRID,
  h: (box.ymax - box.ymin) / GRID,
});

/**
 * A rectangle cut back to the sheet.
 *
 * Asked for a region, a model regularly returns one that runs off the page -- a column
 * "down to the bottom" comes back as y 0.88 with height 0.122. There is no paper beyond
 * the edge, so the overhang marks nothing; kept as given it would later force an excerpt
 * to choose between showing the whole region and staying on the page.
 */
const onPage = (crop: Rect): Rect => {
  const x = clamp(crop.x);
  const y = clamp(crop.y);
  return { x, y, w: clamp(Math.min(crop.w, CONFIDENCE_CEILING - x)), h: clamp(Math.min(crop.h, CONFIDENCE_CEILING - y)) };
};

export const prepareCandidates = (input: MergeInput): MergeOutput => {
  const prepared: PreparedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  const seen = new Set<string>();
  const knownSubfields = new Set(fieldDefinition(input.fieldKey)?.subfields.map((subfield) => subfield.key) ?? []);

  const reject = (raw: RawCandidate, reason: string) =>
    rejected.push({ fieldKey: input.fieldKey, target: raw.subfieldKey ?? raw.rowNaturalKey ?? "?", reason });

  for (const raw of input.candidates) {
    const offered = input.offered[raw.pageRef - 1];
    if (offered === undefined) {
      reject(raw, `pageRef ${raw.pageRef} gehört zu keiner Seite dieser Anfrage`);
      continue;
    }

    /*
     * The target is taken from `targetKind` and the other half is ignored, because a
     * model that must fill every property will put a placeholder in the one that does not
     * apply. What is still checked is that the key it names actually exists: a subfield
     * key invented on the spot would otherwise be written to no field at all and silently
     * disappear.
     */
    const isRow = raw.targetKind === "row";
    const subfieldKey = isRow ? null : (raw.subfieldKey?.trim() ?? "");
    const rowNaturalKey = isRow ? (raw.rowNaturalKey?.trim() ?? "") : null;

    if (isRow && rowNaturalKey === "") {
      reject(raw, "Tabellenzeile ohne rowNaturalKey");
      continue;
    }
    if (!isRow && !knownSubfields.has(subfieldKey ?? "")) {
      reject(raw, `unbekanntes Unterfeld "${subfieldKey}" (bekannt: ${[...knownSubfields].join(", ")})`);
      continue;
    }

    /*
     * The tag is what the model called the passage; the value is the evidence. Where the
     * two disagree the evidence wins, because a readable value with a Fundstelle is a
     * reading whatever it was labelled -- a struck-through Grundbuch entry gets called
     * "geschwärzt" often enough that trusting the label alone loses real values. What the
     * label still decides is the case it cannot get wrong: no value and no claim of a
     * redaction is a candidate about nothing.
     */
    const readValue = raw.value === null || raw.value.trim() === "" ? null : raw.value;
    const tag = readValue === null ? "redacted" : "extracted";
    if (readValue === null && raw.tag !== "redacted") {
      reject(raw, "Kandidat ohne Wert");
      continue;
    }

    const pageText = offered.page.text;
    const pageHasText = pageText.trim() !== "";
    if (pageHasText && tag === "extracted") {
      if (raw.quote === null || raw.quote.trim() === "") {
        reject(raw, "Textseite ohne Zitat");
        continue;
      }
      if (!isVerbatim(raw.quote, pageText)) {
        reject(raw, `Zitat steht nicht wörtlich auf Seite ${offered.page.number}: "${squash(raw.quote).slice(0, 60)}"`);
        continue;
      }
    }

    const facts = input.facts.get(offered.documentId);
    if (facts === undefined) {
      reject(raw, "Dokument ohne Klassifikation");
      continue;
    }

    const canonicalValue = canonicalize(readValue, valueTypeOf(input.fieldKey, subfieldKey));

    const id = candidateId([
      input.fieldKey,
      subfieldKey,
      rowNaturalKey,
      offered.documentId,
      offered.page.number,
      tag,
      canonicalValue,
    ]);
    // The same passage read twice in one run is one candidate.
    if (seen.has(id)) continue;
    seen.add(id);

    prepared.push({
      id,
      fieldKey: input.fieldKey,
      subfieldKey,
      rowNaturalKey,
      cells: cellsToRecord(raw.cells),
      value: readValue,
      canonicalValue,
      tag,
      documentId: offered.documentId,
      page: offered.page.number,
      quote: pageHasText ? raw.quote : null,
      sourceLabel: sourceLabel(facts, offered.fileName, offered.page.number),
      note: noteFor(pageHasText, facts.sourceClass),
      sourceClass: facts.sourceClass,
      crop: raw.box_2d === null || pageHasText ? null : onPage(fromBox(raw.box_2d)),
      confidence: clamp(raw.confidence),
      readings: raw.readings === null || raw.readings.length < 2 ? null : raw.readings,
      rationale: raw.rationale,
    });
  }

  return { prepared, rejected };
};

/**
 * Which candidate a subfield should point at when no person has chosen one.
 *
 * Confidence first, then the more recent document. Deliberately not by source class:
 * the classes are labelled neutrally on purpose, and rule 4 turns a real disagreement
 * into `widerspruch` regardless of which one sits in the field. So this decides only
 * what a clerk sees first, never what counts.
 */
export const preferredCandidate = (
  candidates: readonly PreparedCandidate[],
  documentDate: (documentId: string) => string | null,
): PreparedCandidate | undefined => {
  const readable = candidates.filter((candidate) => candidate.tag === "extracted");
  // A subfield whose only finding is a redaction still gets that as its value: the
  // Fundstelle exists, the value does not, and the status reads `geschwaerzt`.
  const pool = readable.length > 0 ? readable : candidates;
  return [...pool].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const dateA = documentDate(a.documentId) ?? "";
    const dateB = documentDate(b.documentId) ?? "";
    return dateB.localeCompare(dateA);
  })[0];
};
