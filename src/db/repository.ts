import { cache } from "react";
import { CLAUSES, FIELD_GROUPS, fieldDefinition } from "@/catalog/fields";
import { computeSubfieldStatus, type CandidateTag, type StatusCandidate, type StatusContext } from "@/domain/computeStatus";
import { fieldStatus, isOpen } from "@/domain/derive";
import type {
  Candidate,
  CandidateTarget,
  Case,
  CaseView,
  Document,
  EncumbranceRow,
  Field,
  FieldId,
  FieldTable,
  Finding,
  HistoryEntry,
  ImageEvidence,
  ParcelRow,
  Reading,
  Rect,
  RequestItem,
  RequestTemplate,
  Run,
  Subfield,
} from "@/domain/model";
import type { Actor, CaseStatus, DocumentKind, DocumentStatus, FieldStatus, Phase, Procedure, RequestOutcome, SourceClass } from "@/domain/status";
import { todayIso } from "@/lib/clock";
import { formatChangedAt, formatDate, formatLogTime, formatTimestamp, formatTimestampDate } from "@/lib/format";
import { bool, dateOrNull, int, intOrNull, json, numberOrNull, query, text, textOrNull, timestampOrNull, type Row } from "./connect";

/**
 * Reads the store into the view model the pages render.
 *
 * Nothing here decides anything. A value comes from the candidate the subfield points at,
 * a status from computeSubfieldStatus, counts and banners from domain/derive. The
 * repository only assembles, which is why there is no status column to keep in sync.
 *
 * Everything a page needs is fetched in one batch of parallel queries and then joined in
 * memory. A case view is a dozen round trips whether it holds one field or fifty, and the
 * case list costs the same as a single case rather than one query set per row.
 *
 * Ids are scoped by case in the database and handed to the UI unscoped, so a subfield is
 * "digits" in a URL and "2026-0412:purchasePrice.digits" in the store.
 */

const PERCENT = 100;

/** Database ids carry the case; the UI works with the short key, e.g. "landRegister2011". */
const unscope = (caseId: string, id: string) => (id.startsWith(`${caseId}:`) ? id.slice(caseId.length + 1) : id);

/* ---------- Narrowing rows ---------- */

interface StoredCrop extends Rect {
  caption: string;
  hint: string;
  question: string | null;
}

const imageOf = (row: Row): ImageEvidence | undefined => {
  const stored = json<StoredCrop>(row.crop);
  if (!stored) return undefined;
  const readings = json<Reading[]>(row.readings);
  return {
    // Stored as fractions of the page so the marker survives any render size.
    crop: { x: stored.x * PERCENT, y: stored.y * PERCENT, w: stored.w * PERCENT, h: stored.h * PERCENT },
    caption: stored.caption,
    hint: stored.hint,
    ...(stored.question === null ? {} : { question: stored.question }),
    ...(readings === undefined ? {} : { readings }),
  };
};

const toStatusCandidate = (row: Row): StatusCandidate => ({
  id: text(row.id),
  value: textOrNull(row.value),
  canonicalValue: textOrNull(row.canonical_value),
  tag: text(row.tag) as CandidateTag,
  documentId: textOrNull(row.document_id),
  confidence: numberOrNull(row.confidence),
  hasReadings: json<Reading[]>(row.readings) !== undefined,
});

/** Adds `key: value` only when the column is set, so optional properties stay absent. */
const present = <Key extends string, Value>(key: Key, value: Value | null | undefined): Partial<Record<Key, Value>> =>
  value === null || value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);

const toCandidate = (row: Row, target: CandidateTarget, chosenId: string | null, documentKeys: Map<string, string>): Candidate => {
  const documentId = textOrNull(row.document_id);
  const image = imageOf(row);
  return {
    id: text(row.id),
    target,
    value: textOrNull(row.value),
    sourceLabel: text(row.source_label),
    tag: text(row.tag) as CandidateTag,
    isActive: text(row.id) === chosenId,
    ...present("note", textOrNull(row.note)),
    ...present("sourceClass", textOrNull(row.source_class) as SourceClass | null),
    ...present("documentId", documentId === null ? null : documentKeys.get(documentId)),
    ...present("page", intOrNull(row.page)),
    ...present("confidence", numberOrNull(row.confidence)),
    ...present("quote", textOrNull(row.quote)),
    ...present("rationale", textOrNull(row.rationale)),
    ...(image === undefined ? {} : { image }),
  };
};

const toDocument = (row: Row, caseId: string, lastFinishedRun: number): Document => {
  const caption = textOrNull(row.photo_caption);
  const hint = textOrNull(row.photo_hint);
  return {
    id: unscope(caseId, text(row.id)),
    fileName: text(row.file_name),
    type: text(row.doc_type),
    kind: text(row.kind) as DocumentKind,
    date: formatDate(dateOrNull(row.doc_date)),
    pageCount: int(row.page_count),
    status: text(row.status) as DocumentStatus,
    sourceClass: text(row.source_class) as SourceClass,
    quality: text(row.quality),
    title: text(row.title),
    subtitle: text(row.subtitle),
    ...(caption === null || hint === null ? {} : { photoNote: { caption, hint } }),
    ...(int(row.received_in_run) > lastFinishedRun ? { isNew: true } : {}),
  };
};

const toHistory = (row: Row): HistoryEntry => ({
  run: int(row.run),
  at: formatLogTime(timestampOrNull(row.written_at) ?? ""),
  actor: text(row.actor) as Actor,
  text: text(row.text),
});

const toFinding = (row: Row): Finding => ({ title: text(row.title), text: text(row.text) });

const toRequestItem = (row: Row): RequestItem => ({
  fieldId: text(row.field_key) as FieldId,
  title: text(row.title),
  resolvedBy: text(row.resolved_by),
  outcome: text(row.outcome) as RequestOutcome,
});

/* ---------- Grouping ---------- */

const groupBy = <T>(rows: readonly Row[], keyOf: (row: Row) => string | null, map: (row: Row) => T): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(map(row));
    else grouped.set(key, [map(row)]);
  }
  return grouped;
};

const column = (name: string) => (row: Row) => textOrNull(row[name]);

const identity = (row: Row) => row;

/** Findings and history hang off a subfield, a table row or the field itself. */
const ownerOf = (row: Row) => textOrNull(row.subfield_id) ?? textOrNull(row.table_row_id) ?? text(row.field_id);

/* ---------- Loading ---------- */

/**
 * All rows for one case, or for every case when `caseId` is null. The `$1::text IS NULL`
 * guard lets one statement serve both the case view and the case list.
 */
const loadRows = async (caseId: string | null) => {
  // One statement serves both the case view and the case list.
  const scope = (column: string) => `($1::text IS NULL OR ${column} = $1)`;
  const byCase = scope("case_id");
  const byField = scope("f.case_id");

  const [cases, runs, documents, fields, subfields, tableRows, candidates, findings, history, requests, requestItems, progress] =
    await Promise.all([
      query(`SELECT * FROM case_file WHERE ${scope("id")} ORDER BY changed_at DESC`, caseId),
      query(`SELECT * FROM run WHERE ${byCase} ORDER BY case_id, number`, caseId),
      query(`SELECT * FROM document WHERE ${byCase} ORDER BY case_id, sort_order, id`, caseId),
      query(`SELECT * FROM field WHERE ${byCase} ORDER BY case_id, sort_order`, caseId),
      query(
        `SELECT s.*, f.case_id FROM subfield s JOIN field f ON f.id = s.field_id WHERE ${byField} ORDER BY s.field_id, s.sort_order`,
        caseId,
      ),
      query(
        `SELECT r.*, f.case_id FROM table_row r JOIN field f ON f.id = r.field_id WHERE ${byField} ORDER BY r.field_id, r.sort_order`,
        caseId,
      ),
      query(
        `SELECT c.*, f.case_id FROM candidate c
         LEFT JOIN subfield s ON s.id = c.subfield_id
         LEFT JOIN table_row t ON t.id = c.table_row_id
         JOIN field f ON f.id = COALESCE(s.field_id, t.field_id)
         WHERE ${byField} ORDER BY c.created_at, c.id`,
        caseId,
      ),
      query(
        `SELECT fi.* FROM finding fi JOIN field f ON f.id = fi.field_id
         WHERE ${byField} AND fi.resolved_in_run IS NULL`,
        caseId,
      ),
      query(
        `SELECT h.* FROM history h JOIN field f ON f.id = h.field_id WHERE ${byField} ORDER BY h.run, h.written_at, h.id`,
        caseId,
      ),
      query(`SELECT * FROM request WHERE ${byCase} ORDER BY run`, caseId),
      query(
        `SELECT i.*, r.case_id, r.run AS request_run, r.sent_at, f.key AS field_key
         FROM request_item i
         JOIN request r ON r.id = i.request_id
         JOIN field f ON f.id = i.field_id
         WHERE ${scope("r.case_id")} ORDER BY i.sort_order`,
        caseId,
      ),
      query(
        `SELECT r.case_id, rd.document_id, rd.pages_read FROM run_document rd
         JOIN run r ON r.id = rd.run_id
         WHERE ${scope("r.case_id")} AND r.finished_at IS NULL`,
        caseId,
      ),
    ]);

  return { cases, runs, documents, fields, subfields, tableRows, candidates, findings, history, requests, requestItems, progress };
};

type LoadedRows = Awaited<ReturnType<typeof loadRows>>;

/* ---------- Assembly ---------- */

const FIRST_RUN = 1;

interface CaseContext extends StatusContext {
  caseId: string;
  documentKeys: Map<string, string>;
  candidatesBySubfield: Map<string, Row[]>;
  candidatesByRow: Map<string, Row[]>;
  subfieldsByField: Map<string, Row[]>;
  rowsByField: Map<string, Row[]>;
  findings: Map<string, Finding[]>;
  history: Map<string, HistoryEntry[]>;
  /** Field key to the date of a sent request no later run has reconciled. */
  requestedAt: Map<string, string>;
}

interface BuiltSubfields {
  subfields: Subfield[];
  candidates: Candidate[];
  touchedByLaterRun: boolean;
}

const buildSubfields = (fieldRowId: string, context: CaseContext): BuiltSubfields => {
  const subfields: Subfield[] = [];
  const candidates: Candidate[] = [];
  let touchedByLaterRun = false;

  for (const row of context.subfieldsByField.get(fieldRowId) ?? []) {
    const id = text(row.id);
    const key = text(row.key);
    const rows = context.candidatesBySubfield.get(id) ?? [];
    const chosenId = textOrNull(row.chosen_candidate_id);
    if (rows.some((candidate) => int(candidate.run) > FIRST_RUN)) touchedByLaterRun = true;

    const status = computeSubfieldStatus(
      {
        chosenCandidateId: chosenId,
        confirmedCandidateId: textOrNull(row.confirmed_candidate_id),
        staleAfterDays: intOrNull(row.stale_after_days),
        staleWhenValueInPast: bool(row.stale_when_value_in_past),
        confidenceThreshold: numberOrNull(row.confidence_threshold) ?? 1,
      },
      rows.map(toStatusCandidate),
      context,
    );

    const chosen = rows.find((candidate) => text(candidate.id) === chosenId);
    subfields.push({
      id: key,
      label: text(row.label),
      value: chosen === undefined ? null : textOrNull(chosen.value),
      // With no candidate there is no source, so the absence note stands in its place.
      sourceLabel: chosen === undefined ? text(row.absence_note) : text(chosen.source_label),
      status,
      ...present("finding", context.findings.get(id)?.[0]),
      ...present("history", context.history.get(id)),
    });
    const target: CandidateTarget = { kind: "subfield", subfieldId: key };
    candidates.push(...rows.map((candidate) => toCandidate(candidate, target, chosenId, context.documentKeys)));
  }

  return { subfields, candidates, touchedByLaterRun };
};

interface BuiltTable {
  table?: FieldTable;
  candidates: Candidate[];
  data: Record<string, string>[];
}

const buildTable = (fieldRowId: string, fieldKey: FieldId, context: CaseContext): BuiltTable => {
  const rows = context.rowsByField.get(fieldRowId) ?? [];
  const candidates: Candidate[] = [];
  const data: Record<string, string>[] = [];
  const parcels: ParcelRow[] = [];
  const encumbrances: EncumbranceRow[] = [];

  for (const row of rows) {
    const id = text(row.id);
    const key = text(row.key);
    const values = json<Record<string, string>>(row.data) ?? {};
    data.push(values);

    const part = {
      id: key,
      status: text(row.status) as FieldStatus,
      ...present("finding", context.findings.get(id)?.[0]),
      ...present("history", context.history.get(id)),
    };

    if (fieldKey === "parcels") {
      parcels.push({
        ...part,
        district: values.district ?? "",
        section: values.section ?? "",
        parcel: values.parcel ?? "",
        size: values.size ?? "",
        landUse: values.landUse ?? "",
      });
    } else {
      encumbrances.push({
        ...part,
        entry: values.entry ?? "",
        text: values.text ?? "",
        proofLine: values.proofLine ?? "",
        procedure: textOrNull(row.procedure) as Procedure | null,
      });
    }

    const chosenId = textOrNull(row.chosen_candidate_id);
    const target: CandidateTarget = { kind: "row", rowId: key };
    candidates.push(
      ...(context.candidatesByRow.get(id) ?? []).map((candidate) => toCandidate(candidate, target, chosenId, context.documentKeys)),
    );
  }

  if (rows.length === 0) return { candidates, data };
  return {
    table: fieldKey === "parcels" ? { kind: "parcels", rows: parcels } : { kind: "encumbrances", rows: encumbrances },
    candidates,
    data,
  };
};

/**
 * What to request for this field. A run writes the wording for the case at hand -- naming
 * the document and the date it stumbled over -- and the catalog template stands in until
 * one has. Both halves must be present before the stored text wins, so a half-written row
 * cannot leave the basket with a title and no text.
 */
const requestOf = (row: Row, fallback: RequestTemplate | undefined): RequestTemplate | undefined => {
  const title = textOrNull(row.request_title);
  const text = textOrNull(row.request_text);
  return title !== null && text !== null ? { title, text } : fallback;
};

const buildField = (row: Row, context: CaseContext): Field | undefined => {
  const id = text(row.id);
  const key = text(row.key) as FieldId;
  const definition = fieldDefinition(key);
  if (!definition) return undefined;

  const { subfields, candidates, touchedByLaterRun } = buildSubfields(id, context);
  const { table, candidates: rowCandidates, data } = buildTable(id, key, context);
  const byKey = new Map(subfields.map((subfield) => [subfield.id, subfield.value]));
  const leading = subfields.find((subfield) => subfield.value !== null);

  return {
    id: key,
    label: text(row.label),
    shortValue: definition.summary({ value: (subfieldKey) => byKey.get(subfieldKey) ?? null, rows: data }),
    sourceLabel: leading?.sourceLabel ?? "",
    subfields,
    ...(table === undefined ? {} : { table }),
    candidates: [...candidates, ...rowCandidates],
    ...present("request", requestOf(row, definition.request)),
    ...present("noRequestReason", textOrNull(row.no_request_reason)),
    ...present("requestedAt", context.requestedAt.get(key)),
    ...(touchedByLaterRun ? { isNew: true } : {}),
    history: context.history.get(id) ?? [],
  };
};

const caseStatus = (fields: readonly Field[], documents: readonly Document[], phase: Phase): CaseStatus => {
  if (documents.length === 0) return "noDocuments";
  if (phase === "waiting") return "awaitingReply";
  return fields.some((field) => isOpen(fieldStatus(field))) ? "inReview" : "complete";
};

const buildCaseView = (caseRow: Row, rows: LoadedRows, today: string): CaseView => {
  const caseId = text(caseRow.id);
  const forCase = <T extends Row>(list: readonly T[]) => list.filter((row) => text(row.case_id) === caseId);

  const runRows = forCase(rows.runs);
  const finishedRuns = runRows.filter((row) => timestampOrNull(row.finished_at) !== null).map((row) => int(row.number));
  const lastFinishedRun = finishedRuns.length === 0 ? 0 : Math.max(...finishedRuns);

  const documentRows = forCase(rows.documents);
  const documentKeys = new Map(documentRows.map((row) => [text(row.id), unscope(caseId, text(row.id))]));
  const documentDates = new Map(
    documentRows.filter((row) => dateOrNull(row.doc_date) !== null).map((row) => [text(row.id), dateOrNull(row.doc_date) ?? ""]),
  );

  const itemRows = forCase(rows.requestItems);
  const sentItems = itemRows.filter((row) => timestampOrNull(row.sent_at) !== null);
  const openItems = sentItems.filter((row) => int(row.request_run) >= lastFinishedRun);
  const draftItems = itemRows.filter((row) => timestampOrNull(row.sent_at) === null);

  const context: CaseContext = {
    caseId,
    today,
    documentDate: (id) => documentDates.get(id),
    documentKeys,
    subfieldsByField: groupBy(forCase(rows.subfields), column("field_id"), identity),
    rowsByField: groupBy(forCase(rows.tableRows), column("field_id"), identity),
    candidatesBySubfield: groupBy(forCase(rows.candidates), column("subfield_id"), identity),
    candidatesByRow: groupBy(forCase(rows.candidates), column("table_row_id"), identity),
    findings: groupBy(rows.findings, ownerOf, toFinding),
    history: groupBy(rows.history, ownerOf, toHistory),
    requestedAt: new Map(openItems.map((row) => [text(row.field_key), formatTimestampDate(timestampOrNull(row.sent_at) ?? "")])),
  };

  const fields = forCase(rows.fields)
    .map((fieldRow) => buildField(fieldRow, context))
    .filter((field): field is Field => field !== undefined);
  const documents = documentRows.map((row) => toDocument(row, caseId, lastFinishedRun));

  // A request sent during run N is reconciled by run N + 1, which reports what it settled.
  const resolvedByRun = groupBy(
    sentItems.filter((row) => textOrNull(row.outcome) !== null),
    (row) => String(int(row.request_run) + 1),
    toRequestItem,
  );
  const runs: Run[] = runRows.map((row) => ({
    number: int(row.number),
    at: formatTimestamp(timestampOrNull(row.started_at) ?? ""),
    summary: text(row.summary),
    items: resolvedByRun.get(String(int(row.number))) ?? [],
  }));

  // The basket if one is open, otherwise the request that is still awaiting a reply.
  const basketItems = draftItems.length > 0 ? draftItems : openItems;
  const basket = basketItems.map((row) => text(row.field_key) as FieldId);
  const sentAt = draftItems.length > 0 ? null : timestampOrNull(openItems[0]?.sent_at);

  const progress = forCase(rows.progress);
  const phase = text(caseRow.phase) as Phase;

  return {
    case: {
      id: caseId,
      name: text(caseRow.name),
      fileNumber: text(caseRow.file_number),
      property: text(caseRow.property),
      status: caseStatus(fields, documents, phase),
      changedAt: formatChangedAt(timestampOrNull(caseRow.changed_at) ?? "", today),
      phase,
      currentRun: int(caseRow.current_run),
    },
    fields,
    groups: FIELD_GROUPS,
    documents,
    runs,
    clauses: CLAUSES,
    basket,
    ...present("requestSentAt", sentAt === null ? null : formatTimestampDate(sentAt)),
    recipient: text(caseRow.recipient_name),
    recipientEmail: text(caseRow.recipient_email),
    ...(progress.length === 0
      ? {}
      : {
          analysisProgress: Object.fromEntries(progress.map((row) => [unscope(caseId, text(row.document_id)), int(row.pages_read)])),
        }),
  };
};

/* ---------- Public reads ---------- */

/**
 * Memoised per request: the case layout and the page beneath it both ask for the view,
 * and one load serves both.
 */
export const getCaseView = cache(async (caseId: string): Promise<CaseView | undefined> => {
  const rows = await loadRows(caseId);
  const caseRow = rows.cases[0];
  return caseRow === undefined ? undefined : buildCaseView(caseRow, rows, todayIso());
});

export const listCases = async (): Promise<Case[]> => {
  const rows = await loadRows(null);
  const today = todayIso();
  return rows.cases.map((caseRow) => buildCaseView(caseRow, rows, today).case);
};
