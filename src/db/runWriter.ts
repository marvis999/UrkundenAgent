import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { PreparedCandidate } from "@/agent/merge";
import { preferredCandidate } from "@/agent/merge";
import type { DocumentFacts } from "@/agent/tasks/classifyDocument";
import type { Findings } from "@/agent/tasks/writeFinding";
import type { FieldId } from "@/domain/model";
import { nowIso } from "@/lib/clock";
import { int, query, text, textOrNull, transaction, type Row } from "./connect";

/**
 * Everything a run writes.
 *
 * The sibling of `mutations.ts`, and it keeps the same discipline: one transaction per
 * step, and no value written without a history entry naming who put it there. The two
 * differ in exactly one way -- a person's change is authoritative, a run's is a proposal,
 * so this module never overwrites what a person decided:
 *
 *  - a subfield whose chosen candidate is `manual` keeps it. The clerk read the document
 *    and corrected the value; a later run finding the old text again does not undo that.
 *  - a subfield whose chosen candidate is confirmed keeps it too, because moving the
 *    chosen candidate would silently unconfirm a value somebody signed off on.
 *
 * Candidate ids are derived from content, so every insert is `ON CONFLICT DO NOTHING`
 * and a run that is repeated after a crash produces no duplicates.
 */

const AGENT = "agent";

const one = async (client: PoolClient, sql: string, parameters: unknown[]): Promise<Row | undefined> => {
  const { rows } = await client.query<Row>(sql, parameters);
  return rows[0];
};

const writeHistory = (
  client: PoolClient,
  fieldId: string,
  owner: { subfieldId?: string | null; tableRowId?: string | null },
  run: number,
  message: string,
) =>
  client.query(
    `INSERT INTO history (id, field_id, subfield_id, table_row_id, run, written_at, actor, text)
     VALUES ($1, $2, $3, $4, $5, $6, 'agent', $7)`,
    [randomUUID(), fieldId, owner.subfieldId ?? null, owner.tableRowId ?? null, run, nowIso(), message],
  );

/* ---------- The run row ---------- */

/**
 * Opens the run and puts the case into the analysis phase, which is what makes the
 * progress strip appear. Repeating a run number resumes it rather than failing.
 */
export const startRun = async (caseId: string, number: number): Promise<string> =>
  transaction(async (client) => {
    const runId = `${caseId}:run-${number}`;
    await client.query(
      `INSERT INTO run (id, case_id, number, started_at, finished_at, pages_read, summary)
       VALUES ($1, $2, $3, $4, NULL, 0, '')
       ON CONFLICT (case_id, number) DO UPDATE SET started_at = EXCLUDED.started_at, finished_at = NULL`,
      [runId, caseId, number, nowIso()],
    );
    await client.query("UPDATE case_file SET phase = 'analysis', current_run = $1, changed_at = $2 WHERE id = $3", [
      number,
      nowIso(),
      caseId,
    ]);
    return runId;
  });

export const finishRun = (
  runId: string,
  caseId: string,
  summary: string,
  provenance: { model: string | null; promptVersion: string | null },
) =>
  transaction(async (client) => {
    const pages = await one(client, "SELECT COALESCE(SUM(pages_read), 0) AS total FROM run_document WHERE run_id = $1", [runId]);
    await client.query(
      "UPDATE run SET finished_at = $1, pages_read = $2, summary = $3, model = $4, prompt_version = $5 WHERE id = $6",
      [nowIso(), int(pages?.total), summary, provenance.model, provenance.promptVersion, runId],
    );
    await client.query("UPDATE case_file SET phase = 'review', changed_at = $1 WHERE id = $2", [nowIso(), caseId]);
  });

/**
 * Reopens the case's current run, which makes its documents count as unread again.
 *
 * An aid for iterating on prompts, not part of the loop: a finished run is the record
 * that those pages have been read, and `planRun` reads it that way. Nothing is deleted --
 * candidates are content-addressed, so reading the same page again writes the same rows.
 */
export const reopenRun = (caseId: string) =>
  query(
    `UPDATE run SET finished_at = NULL
     WHERE case_id = $1 AND number = (SELECT current_run FROM case_file WHERE id = $1)`,
    caseId,
  );

/** Progress per document, which is what the analysis strip counts down. */
export const recordProgress = (runId: string, documentId: string, pagesRead: number) =>
  query(
    `INSERT INTO run_document (run_id, document_id, pages_read) VALUES ($1, $2, $3)
     ON CONFLICT (run_id, document_id) DO UPDATE SET pages_read = EXCLUDED.pages_read`,
    runId,
    documentId,
    pagesRead,
  );

/* ---------- What the classification learned ---------- */

export const saveDocumentFacts = (documentId: string, facts: DocumentFacts) =>
  transaction(async (client) => {
    await client.query(
      `UPDATE document SET doc_type = $1, doc_date = $2, source_class = $3, status = $4, quality = $5,
                           title = $6, subtitle = $7, photo_caption = $8, photo_hint = $9
       WHERE id = $10`,
      [
        facts.docType,
        facts.docDate,
        facts.sourceClass,
        facts.status,
        facts.quality,
        facts.title,
        facts.subtitle,
        facts.photoCaption,
        facts.photoHint,
        documentId,
      ],
    );
  });

/* ---------- Candidates ---------- */

interface TargetIds {
  readonly fieldId: string;
  readonly subfieldIds: ReadonlyMap<string, string>;
  readonly rowIds: Map<string, string>;
  readonly nextSortOrder: number;
}

const loadTargets = async (client: PoolClient, caseId: string, fieldKey: FieldId): Promise<TargetIds | undefined> => {
  const field = await one(client, "SELECT id FROM field WHERE case_id = $1 AND key = $2", [caseId, fieldKey]);
  if (!field) return undefined;
  const fieldId = text(field.id);

  const { rows: subfields } = await client.query<Row>("SELECT id, key FROM subfield WHERE field_id = $1", [fieldId]);
  const { rows: existing } = await client.query<Row>(
    "SELECT id, natural_key FROM table_row WHERE field_id = $1 ORDER BY sort_order",
    [fieldId],
  );

  return {
    fieldId,
    subfieldIds: new Map(subfields.map((row) => [text(row.key), text(row.id)])),
    rowIds: new Map(existing.map((row) => [text(row.natural_key), text(row.id)])),
    nextSortOrder: existing.length,
  };
};

/**
 * A table row is recognised across runs by its natural key, so a second run updates the
 * row it already created instead of adding a duplicate. The short `key` is what links
 * point at, so it is assigned once and never changes.
 */
const ensureRow = async (
  client: PoolClient,
  targets: TargetIds,
  naturalKey: string,
  cells: Readonly<Record<string, string>>,
  sortOrder: number,
): Promise<string> => {
  const known = targets.rowIds.get(naturalKey);
  if (known !== undefined) {
    // Content may improve on a later reading; a confirmed row is left alone.
    await client.query("UPDATE table_row SET data = $1 WHERE id = $2 AND status <> 'confirmed'", [
      JSON.stringify(cells),
      known,
    ]);
    return known;
  }

  const key = `r${sortOrder + 1}`;
  const rowId = `${targets.fieldId}#${key}`;
  await client.query(
    `INSERT INTO table_row (id, field_id, key, natural_key, sort_order, data, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'proposed')
     ON CONFLICT (field_id, natural_key) DO NOTHING`,
    [rowId, targets.fieldId, key, naturalKey, sortOrder, JSON.stringify(cells)],
  );
  targets.rowIds.set(naturalKey, rowId);
  return rowId;
};

const CANDIDATE_INSERT = `
  INSERT INTO candidate (id, subfield_id, table_row_id, value, canonical_value, tag, document_id, page, quote,
                         source_label, note, source_class, crop, confidence, readings, rationale,
                         source_candidate_id, run, created_by, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NULL, $17, 'agent', $18)
  ON CONFLICT (id) DO NOTHING`;

/**
 * True while nobody has taken responsibility for the value: no candidate chosen, or one
 * chosen by an earlier run that is neither a manual correction nor confirmed.
 */
const MAY_REPLACE_CHOICE = `
  s.chosen_candidate_id IS NULL
  OR (s.chosen_candidate_id IS DISTINCT FROM s.confirmed_candidate_id
      AND NOT EXISTS (SELECT 1 FROM candidate c WHERE c.id = s.chosen_candidate_id AND c.tag = 'manual'))`;

export interface CandidateReport {
  readonly written: number;
  readonly rowsTouched: number;
  readonly subfieldsFilled: number;
}

export const saveCandidates = (
  caseId: string,
  run: number,
  fieldKey: FieldId,
  prepared: readonly PreparedCandidate[],
  documentDate: (documentId: string) => string | null,
): Promise<CandidateReport> =>
  transaction(async (client) => {
    const targets = await loadTargets(client, caseId, fieldKey);
    if (targets === undefined) return { written: 0, rowsTouched: 0, subfieldsFilled: 0 };

    const at = nowIso();
    let written = 0;
    let sortOrder = targets.nextSortOrder;
    const rowsTouched = new Set<string>();

    const insert = (candidate: PreparedCandidate, subfieldId: string | null, rowId: string | null) =>
      client.query(CANDIDATE_INSERT, [
        candidate.id,
        subfieldId,
        rowId,
        candidate.value,
        candidate.canonicalValue,
        candidate.tag,
        candidate.documentId,
        candidate.page,
        candidate.quote,
        candidate.sourceLabel,
        candidate.note,
        candidate.sourceClass,
        candidate.crop === null ? null : JSON.stringify(candidate.crop),
        candidate.confidence,
        candidate.readings === null ? null : JSON.stringify(candidate.readings),
        candidate.rationale,
        run,
        at,
      ]);

    /* Table rows first: a candidate cannot point at a row that does not exist yet. */
    for (const candidate of prepared) {
      if (candidate.rowNaturalKey === null) continue;
      const rowId = await ensureRow(client, targets, candidate.rowNaturalKey, candidate.cells, sortOrder);
      if (!rowsTouched.has(rowId)) {
        sortOrder += 1;
        rowsTouched.add(rowId);
      }
      const { rowCount } = await insert(candidate, null, rowId);
      written += rowCount ?? 0;
      await client.query(`UPDATE table_row SET chosen_candidate_id = $1 WHERE id = $2 AND chosen_candidate_id IS NULL`, [
        candidate.id,
        rowId,
      ]);
    }

    /* Subfields: write every candidate, then decide which one sits in the field. */
    const bySubfield = new Map<string, PreparedCandidate[]>();
    for (const candidate of prepared) {
      if (candidate.subfieldKey === null) continue;
      const subfieldId = targets.subfieldIds.get(candidate.subfieldKey);
      if (subfieldId === undefined) continue;
      const { rowCount } = await insert(candidate, subfieldId, null);
      written += rowCount ?? 0;
      bySubfield.set(subfieldId, [...(bySubfield.get(subfieldId) ?? []), candidate]);
    }

    let subfieldsFilled = 0;
    for (const [subfieldId, candidates] of bySubfield) {
      const preferred = preferredCandidate(candidates, documentDate);
      if (preferred === undefined) continue;
      const { rowCount } = await client.query(
        `UPDATE subfield s SET chosen_candidate_id = $1, absence_note = NULL
         WHERE s.id = $2 AND (${MAY_REPLACE_CHOICE})`,
        [preferred.id, subfieldId],
      );
      if ((rowCount ?? 0) > 0) {
        subfieldsFilled += 1;
        const others = candidates.length > 1 ? `, ${candidates.length - 1} weitere Fundstelle(n)` : "";
        await writeHistory(client, targets.fieldId, { subfieldId }, run, `aus ${preferred.sourceLabel} vorgeschlagen${others}`);
      }
    }

    return { written, rowsTouched: rowsTouched.size, subfieldsFilled };
  });

/**
 * Says why a subfield has no value, for every subfield a run looked for and did not find.
 * Without this the field shows `fehlt` with an empty source line, which reads as a bug
 * rather than as a finding.
 */
export const noteAbsences = (caseId: string, note: string) =>
  query(
    `UPDATE subfield s SET absence_note = $2
     FROM field f WHERE f.id = s.field_id AND f.case_id = $1
       AND s.chosen_candidate_id IS NULL AND s.absence_note IS NULL`,
    caseId,
    note,
  );

/* ---------- Findings and the request text ---------- */

export const saveFindings = (caseId: string, run: number, fieldKey: FieldId, findings: Findings) =>
  transaction(async (client) => {
    const targets = await loadTargets(client, caseId, fieldKey);
    if (targets === undefined) return;

    await client.query(
      "UPDATE field SET no_request_reason = $1, request_title = $2, request_text = $3 WHERE id = $4",
      [findings.noRequestReason, findings.requestTitle, findings.requestText, targets.fieldId],
    );

    for (const finding of findings.findings) {
      const subfieldId = targets.subfieldIds.get(finding.subfieldKey);
      if (subfieldId === undefined) continue;
      // One live finding per subfield: the previous run's wording is replaced, not stacked.
      await client.query("DELETE FROM finding WHERE subfield_id = $1 AND resolved_in_run IS NULL", [subfieldId]);
      await client.query(
        `INSERT INTO finding (id, field_id, subfield_id, table_row_id, title, text, created_in_run)
         VALUES ($1, $2, $3, NULL, $4, $5, $6)`,
        [randomUUID(), targets.fieldId, subfieldId, finding.title, finding.text, run],
      );
    }
  });

/* ---------- Derived values ---------- */

export interface DerivationWrite {
  readonly fieldKey: FieldId;
  readonly targetSubfieldKey: string;
  readonly sourceCandidateId: string;
  readonly value: string;
  readonly canonicalValue: string | null;
  readonly sourceLabel: string;
  readonly rationale: string;
}

/**
 * Writes a value computed from another candidate. The link to that candidate is what
 * makes the value expire on its own: when the source stops being chosen, `dropStaleDerived`
 * in mutations.ts removes this row, and the subfield goes back to having no value.
 */
export const saveDerived = (caseId: string, run: number, derivation: DerivationWrite) =>
  transaction(async (client) => {
    const targets = await loadTargets(client, caseId, derivation.fieldKey);
    const subfieldId = targets?.subfieldIds.get(derivation.targetSubfieldKey);
    if (targets === undefined || subfieldId === undefined) return;

    // A derived value is identified by its source, so recomputing it is idempotent.
    const id = `d-${derivation.sourceCandidateId}-${derivation.targetSubfieldKey}`;
    const { rowCount } = await client.query(
      `INSERT INTO candidate (id, subfield_id, table_row_id, value, canonical_value, tag, source_label,
                              rationale, source_candidate_id, run, created_by, created_at)
       VALUES ($1, $2, NULL, $3, $4, 'derived', $5, $6, $7, $8, 'agent', $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        subfieldId,
        derivation.value,
        derivation.canonicalValue,
        derivation.sourceLabel,
        derivation.rationale,
        derivation.sourceCandidateId,
        run,
        nowIso(),
      ],
    );

    const updated = await client.query(
      `UPDATE subfield s SET chosen_candidate_id = $1, absence_note = NULL
       WHERE s.id = $2 AND (${MAY_REPLACE_CHOICE})`,
      [id, subfieldId],
    );
    if ((rowCount ?? 0) > 0 && (updated.rowCount ?? 0) > 0) {
      await writeHistory(client, targets.fieldId, { subfieldId }, run, `abgeleitet: ${derivation.value}`);
    }
  });

/** The chosen candidate of one subfield, for a derivation that reads from it. */
export const chosenCandidate = async (
  caseId: string,
  fieldKey: string,
  subfieldKey: string,
): Promise<{ id: string; value: string } | undefined> => {
  const rows = await query(
    `SELECT c.id, c.value FROM subfield s
     JOIN field f ON f.id = s.field_id
     JOIN candidate c ON c.id = s.chosen_candidate_id
     WHERE f.case_id = $1 AND f.key = $2 AND s.key = $3`,
    caseId,
    fieldKey,
    subfieldKey,
  );
  const row = rows[0];
  const value = row === undefined ? null : textOrNull(row.value);
  return row === undefined || value === null ? undefined : { id: text(row.id), value };
};
