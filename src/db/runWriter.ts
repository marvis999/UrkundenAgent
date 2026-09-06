import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { PreparedCandidate } from "@/agent/merge";
import { preferredCandidate } from "@/agent/merge";
import type { DocumentFacts } from "@/agent/tasks/classifyDocument";
import type { Findings } from "@/agent/tasks/writeFinding";
import type { FieldId } from "@/domain/model";
import { REQUEST_OUTCOME_META, type RequestOutcome } from "@/domain/status";
import { nowIso } from "@/lib/clock";
import { formatRun } from "@/lib/format";
import { int, one, query, queryOne, text, textOrNull, transaction, type Row } from "./connect";
import { writeHistory } from "./mutations";

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

/* ---------- The run row ---------- */

/**
 * The number a run started now would carry. An unfinished run is resumed rather than
 * duplicated, so a crash halfway through does not leave a case with two runs claiming the
 * same documents -- and the button, the progress strip and the run log all name it.
 *
 * Not the same question as which run a newly arrived document waits for; see
 * `receivingRun` in files.ts, which parts ways with this one exactly while a run is in
 * flight and has already fixed its plan.
 */
export const nextRunNumber = async (caseId: string): Promise<number> => {
  const row = await queryOne(
    `SELECT c.current_run, r.finished_at FROM case_file c
     LEFT JOIN run r ON r.case_id = c.id AND r.number = c.current_run
     WHERE c.id = $1`,
    caseId,
  );
  if (row === undefined) return 0;
  const current = int(row.current_run);
  // current_run 0 means nothing has ever run, and the join found no row rather than an
  // unfinished one; either way the first run is number 1.
  return current > 0 && row.finished_at === null ? current : current + 1;
};

/**
 * Documents waiting to be read: rendered, and not yet read by a finished run. Word for
 * word the set `planRun` picks up, so the phase cannot promise a run something the run
 * then skips.
 */
const AWAITING_RUN = `
  SELECT 1 FROM document d
  WHERE d.case_id = c.id
    AND EXISTS (SELECT 1 FROM page p WHERE p.document_id = d.id)
    AND NOT EXISTS (
      SELECT 1 FROM run_document rd JOIN run r ON r.id = rd.run_id
      WHERE rd.document_id = d.id AND r.finished_at IS NOT NULL)`;

/**
 * Moves the case to `eingang` when something is lying there for the next run.
 *
 * This is the step that closes the circle: without it a case stays in `pruefen` however
 * many documents arrive, and the banner never offers the run that would read them. Only
 * the resting phases move -- a run in flight keeps its progress strip -- and a case whose
 * new files all turned out to be unrenderable stays where it was, because a run over them
 * would read nothing.
 *
 * Called after every ingest and at the end of every run, which between them are the only
 * two moments at which the answer can change.
 */
const INTAKE = `
  UPDATE case_file c SET phase = 'intake', changed_at = $2
  WHERE c.id = $1 AND c.phase IN ('review', 'waiting') AND EXISTS (${AWAITING_RUN})`;

export const noteIntake = (caseId: string) => query(INTAKE, caseId, nowIso());

/**
 * Writes the address the run read off the documents, once.
 *
 * The case is opened with a name and nothing else; the address of the property is in the
 * documents, so it arrives the way every other value does. Written only while the case
 * has none, because after that a person may have corrected it and a later run must not
 * quietly change what the file is called.
 */
export const notePropertyAddress = (caseId: string, address: string) =>
  query("UPDATE case_file SET property = $2 WHERE id = $1 AND property = ''", caseId, address);

/**
 * Opens the run and puts the case into the analysis phase, which is what makes the
 * progress strip appear. Repeating a run number resumes it rather than failing.
 */
export const startRun = async (caseId: string, number: number): Promise<string> =>
  transaction(async (client) => {
    const runId = `${caseId}:run-${number}`;
    await client.query(
      `INSERT INTO run (id, case_id, number, started_at, finished_at, summary)
       VALUES ($1, $2, $3, $4, NULL, '')
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

export const finishRun = async (runId: string, caseId: string, summary: string) => {
  await transaction(async (client) => {
    await client.query("UPDATE run SET finished_at = $1, summary = $2 WHERE id = $3", [nowIso(), summary, runId]);
    await client.query("UPDATE case_file SET phase = 'review', changed_at = $1 WHERE id = $2", [nowIso(), caseId]);
  });
  // A document that arrived while the run was reading was not in its plan, so the case
  // goes straight back to `eingang` rather than looking done with it lying there.
  await noteIntake(caseId);
};

const ABANDONED = "Durchlauf abgebrochen: Anwendung neu gestartet";

/**
 * Frees every case that was mid-run when the process died.
 *
 * A run lives only inside the process that started it -- the guard and the
 * AbortController are held in memory -- so at start-up there is provably no run in
 * flight, whatever the database says. Without this a container restart during a run
 * leaves the case showing a progress strip that nothing will ever move, and the only way
 * out is a clerk pressing Abbrechen on a run that is not running.
 *
 * Takes the client the bootstrap already holds rather than going through `query`, which
 * would wait on the bootstrap that is calling it. The run rows stay unfinished, so their
 * documents are read again rather than skipped.
 */
export const releaseAbandonedRuns = async (client: PoolClient): Promise<number> => {
  const { rows } = await client.query<Row>(
    "UPDATE case_file SET phase = 'review', changed_at = $1 WHERE phase = 'analysis' RETURNING id",
    [nowIso()],
  );
  for (const row of rows) {
    const caseId = text(row.id);
    await client.query("UPDATE run SET summary = $2 WHERE case_id = $1 AND finished_at IS NULL", [caseId, ABANDONED]);
    await client.query(INTAKE, [caseId, nowIso()]);
  }
  return rows.length;
};

/**
 * Ends a run that did not get to `finishRun`: cancelled by the clerk, or failed.
 *
 * `finished_at` deliberately stays null. That is what marks the run's documents unread,
 * so starting again reads exactly the same set rather than skipping it -- the same
 * property that makes a crashed run safe to repeat. Only the phase moves, because a case
 * left in `analysis` shows a progress strip that will never fill.
 */
export const endAnalysis = async (caseId: string, note: string) => {
  await transaction(async (client) => {
    await client.query("UPDATE run SET summary = $1 WHERE case_id = $2 AND finished_at IS NULL", [note, caseId]);
    await client.query("UPDATE case_file SET phase = 'review', changed_at = $1 WHERE id = $2 AND phase = 'analysis'", [
      nowIso(),
      caseId,
    ]);
  });
  // Its documents are unread again, so the case belongs back in `eingang` and offers the
  // run a second time rather than stranding the files it never got to.
  await noteIntake(caseId);
};

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
  query(
    `UPDATE document SET doc_type = $1, doc_date = $2, source_class = $3, status = $4, quality = $5,
                         title = $6, subtitle = $7, photo_caption = $8, photo_hint = $9
     WHERE id = $10`,
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
  );

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
                         source_candidate_id, run, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NULL, $17, $18)
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
  /**
   * Candidates this run put behind a value. Counted per candidate, not per inserted row:
   * ids are derived from content, so reading the same page twice writes nothing the second
   * time, and counting the insert would report a repeated run as having found nothing.
   */
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
      await insert(candidate, null, rowId);
      written += 1;
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
      await insert(candidate, subfieldId, null);
      written += 1;
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
        await writeHistory(client, targets.fieldId, { subfieldId }, run, "agent", `aus ${preferred.sourceLabel} vorgeschlagen${others}`);
      }
    }

    return { written, rowsTouched: rowsTouched.size, subfieldsFilled };
  });

/**
 * Says why a subfield has no value, for every subfield a run looked for and did not find.
 * Without this the field shows `fehlt` with an empty source line, which reads as a bug
 * rather than as a finding.
 *
 * The note is rewritten rather than only filled in, because the reason changes: a case
 * whose subfields said "noch keine Unterlagen im Vorgang" has had documents read by the
 * time this runs, and leaving the old sentence under the value would date the finding to
 * before the run that produced it.
 */
export const noteAbsences = (caseId: string, note: string) =>
  query(
    `UPDATE subfield s SET absence_note = $2
     FROM field f WHERE f.id = s.field_id AND f.case_id = $1
       AND s.chosen_candidate_id IS NULL AND s.absence_note IS DISTINCT FROM $2`,
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
      // One finding per subfield: the previous run's wording is replaced, not stacked.
      await client.query("DELETE FROM finding WHERE subfield_id = $1", [subfieldId]);
      await client.query("INSERT INTO finding (id, field_id, subfield_id, title, text) VALUES ($1, $2, $3, $4, $5)", [
        randomUUID(),
        targets.fieldId,
        subfieldId,
        finding.title,
        finding.text,
      ]);
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
                              rationale, source_candidate_id, run, created_at)
       VALUES ($1, $2, NULL, $3, $4, 'derived', $5, $6, $7, $8, $9)
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
      await writeHistory(client, targets.fieldId, { subfieldId }, run, "agent", `abgeleitet: ${derivation.value}`);
    }
  });

/* ---------- The sent request, closed by the run that answered it ---------- */

export interface ResolvedItem {
  readonly fieldKey: FieldId;
  readonly outcome: RequestOutcome;
  readonly resolvedBy: string;
}

/** Values of a field that still have no source at all, and how many there are in total. */
const WITHOUT_SOURCE = `
  SELECT COUNT(*) FILTER (WHERE s.chosen_candidate_id IS NULL) AS without_source, COUNT(*) AS total
  FROM subfield s WHERE s.field_id = $1`;

/** Which files of this run produced anything for the field, subfields and rows alike. */
const CONTRIBUTING_FILES = `
  SELECT DISTINCT d.file_name
  FROM candidate c
  LEFT JOIN subfield s ON s.id = c.subfield_id
  LEFT JOIN table_row t ON t.id = c.table_row_id
  JOIN document d ON d.id = c.document_id
  WHERE COALESCE(s.field_id, t.field_id) = $1 AND c.run = $2
  ORDER BY d.file_name`;

/**
 * Records what a run did to each open position of the request that was sent.
 *
 * A position asks for a document, so it is measured by sources arriving and not by a
 * person confirming: `erledigt` once no value of the field is without a source any more,
 * `teilweise` when this run brought something but left values open, `offen` when the
 * documents it read contributed nothing to that field. That is the difference between
 * "the answer came" and "the answer was accepted", and only the first one is the
 * recipient's doing.
 *
 * The file names stay on the position, because "wodurch wurde das erledigt" is the
 * question the run log is asked next.
 */
export const resolveRequestItems = async (caseId: string, run: number): Promise<ResolvedItem[]> => {
  const open = await query(
    `SELECT ri.id, ri.field_id, f.key AS field_key
     FROM request_item ri
     JOIN request rq ON rq.id = ri.request_id
     JOIN field f ON f.id = ri.field_id
     WHERE rq.case_id = $1 AND rq.sent_at IS NOT NULL AND ri.outcome IS NULL
     ORDER BY ri.sort_order`,
    caseId,
  );
  if (open.length === 0) return [];

  const resolved: ResolvedItem[] = [];
  for (const item of open) {
    const fieldId = text(item.field_id);
    const [counts] = await query(WITHOUT_SOURCE, fieldId);
    const files = (await query(CONTRIBUTING_FILES, fieldId, run)).map((row) => text(row.file_name));
    const withoutSource = int(counts?.without_source);
    const total = int(counts?.total);

    const outcome: RequestOutcome = files.length === 0 ? "open" : withoutSource === 0 ? "done" : "partial";
    const resolvedBy =
      outcome === "open"
        ? `${formatRun(run)}: nichts dazu in den neuen Unterlagen`
        : outcome === "done"
          ? files.join(", ")
          : `${files.join(", ")}, ${withoutSource} von ${total} Werten weiter ohne Quelle`;

    await transaction(async (client) => {
      await client.query("UPDATE request_item SET outcome = $1, resolved_by = $2 WHERE id = $3", [
        outcome,
        resolvedBy,
        text(item.id),
      ]);
      await writeHistory(client, fieldId, {}, run, "agent", `Anforderung ${REQUEST_OUTCOME_META[outcome].label}: ${resolvedBy}`);
    });
    resolved.push({ fieldKey: text(item.field_key) as FieldId, outcome, resolvedBy });
  }
  // The phase needs no help here: the case has been in `analysis` since `startRun`, and
  // `finishRun` puts it back into review whether or not a request was waiting.
  return resolved;
};

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
