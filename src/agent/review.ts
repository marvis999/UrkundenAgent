import { computeSubfieldStatus } from "@/domain/computeStatus";
import type { FieldId, Reading } from "@/domain/model";
import type { SourceSummary, SubfieldSummary } from "./tasks/writeFinding";
import { dateOrNull, json, numberOrNull, query, text, textOrNull } from "@/db/connect";
import { toStatusCandidate, toStatusSubfield } from "@/db/repository";

/**
 * The state of a case after the merge, as the status rules see it.
 *
 * Deliberately not the view model: a run must not depend on how a page renders. What it
 * does share is `computeSubfieldStatus` and the two row mappers that feed it, so the
 * status the finding agent is told about is character for character the status the badge
 * will show. Anything else would let a run write "veraltet" under a value the UI calls
 * confirmed.
 */

export interface ReviewedField {
  readonly fieldKey: FieldId;
  readonly subfields: readonly SubfieldSummary[];
}

const SUBFIELDS = `
  SELECT f.key AS field_key, s.id, s.key, s.label, s.chosen_candidate_id, s.confirmed_candidate_id,
         s.stale_after_days, s.stale_when_value_in_past, s.confidence_threshold
  FROM subfield s JOIN field f ON f.id = s.field_id
  WHERE f.case_id = $1
  ORDER BY f.sort_order, s.sort_order`;

const CANDIDATES = `
  SELECT c.id, c.subfield_id, c.value, c.canonical_value, c.tag, c.document_id, c.confidence, c.readings,
         c.source_label
  FROM candidate c JOIN subfield s ON s.id = c.subfield_id
  JOIN field f ON f.id = s.field_id
  WHERE f.case_id = $1`;

export const reviewCase = async (caseId: string, today: string): Promise<ReviewedField[]> => {
  const [subfieldRows, candidateRows, documentRows] = await Promise.all([
    query(SUBFIELDS, caseId),
    query(CANDIDATES, caseId),
    query("SELECT id, doc_date FROM document WHERE case_id = $1", caseId),
  ]);

  const documentDates = new Map(documentRows.map((row) => [text(row.id), dateOrNull(row.doc_date)]));
  const context = {
    documentDate: (id: string) => documentDates.get(id) ?? undefined,
    today,
  };
  const bySubfield = Map.groupBy(candidateRows, (row) => text(row.subfield_id));

  const byField = new Map<FieldId, SubfieldSummary[]>();
  for (const row of subfieldRows) {
    const rows = bySubfield.get(text(row.id)) ?? [];
    const chosenId = textOrNull(row.chosen_candidate_id);
    const status = computeSubfieldStatus(toStatusSubfield(row), rows.map(toStatusCandidate), context);

    const sources: SourceSummary[] = rows.map((candidate) => ({
      value: textOrNull(candidate.value),
      sourceLabel: text(candidate.source_label),
      confidence: numberOrNull(candidate.confidence),
      readings: (json<Reading[]>(candidate.readings) ?? []).map((reading) => reading.value),
      isChosen: text(candidate.id) === chosenId,
    }));

    const fieldKey = text(row.field_key) as FieldId;
    byField.set(fieldKey, [
      ...(byField.get(fieldKey) ?? []),
      {
        key: text(row.key),
        label: text(row.label),
        status,
        value: textOrNull(rows.find((candidate) => text(candidate.id) === chosenId)?.value),
        sources,
      },
    ]);
  }

  return [...byField].map(([fieldKey, subfields]) => ({ fieldKey, subfields }));
};
