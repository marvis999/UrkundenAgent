import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { fieldDefinition } from "@/catalog/fields";
import { workspace } from "@/data/workspace";
import type { FieldId } from "@/domain/model";
import { PROCEDURE_META, type Actor, type Procedure } from "@/domain/status";
import { canonicalize, type ValueType } from "@/domain/value";
import { nowIso } from "@/lib/clock";
import { int, one, text, textOrNull, transaction, type Row } from "./connect";

/**
 * Everything a person can change.
 *
 * The rules from the data model are enforced here, not in the UI:
 *  - choosing a different candidate silently unconfirms the value, because the
 *    confirmation names one candidate and that candidate is no longer in the field;
 *  - a derived value whose source is no longer chosen stops being true and is dropped;
 *  - nothing is written without a history entry that says who did it and why.
 *
 * Each function runs in one transaction, so a half-applied change cannot survive.
 */

const CLERK = workspace.userInitials;

/**
 * Every mutation is one transaction that ends by bumping the case's changed_at, so the
 * case list orders by what was last touched and no writer can forget to do so.
 */
const mutate = (caseId: string, work: (client: PoolClient, run: number) => Promise<void>) =>
  transaction(async (client) => {
    const caseRow = await one(client, "SELECT current_run FROM case_file WHERE id = $1", [caseId]);
    if (!caseRow) return;
    await work(client, int(caseRow.current_run));
    await client.query("UPDATE case_file SET changed_at = $1 WHERE id = $2", [nowIso(), caseId]);
  });

/** Who did what, on which value, in which run. Shared with the run writer. */
export const writeHistory = (
  client: PoolClient,
  fieldId: string,
  owner: { subfieldId?: string | null; tableRowId?: string | null },
  run: number,
  actor: Actor,
  message: string,
) =>
  client.query(
    "INSERT INTO history (id, field_id, subfield_id, table_row_id, run, written_at, actor, text) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [randomUUID(), fieldId, owner.subfieldId ?? null, owner.tableRowId ?? null, run, nowIso(), actor, message],
  );

/* ---------- Locating the target of an action ---------- */

interface SubfieldRow {
  id: string;
  fieldId: string;
  valueType: ValueType;
  chosenCandidateId: string | null;
}

const findSubfield = async (client: PoolClient, caseId: string, fieldKey: string, subfieldKey: string): Promise<SubfieldRow | undefined> => {
  const row = await one(
    client,
    `SELECT s.id, s.field_id, s.value_type, s.chosen_candidate_id
     FROM subfield s JOIN field f ON f.id = s.field_id
     WHERE f.case_id = $1 AND f.key = $2 AND s.key = $3`,
    [caseId, fieldKey, subfieldKey],
  );
  if (!row) return undefined;
  return {
    id: text(row.id),
    fieldId: text(row.field_id),
    valueType: text(row.value_type) as ValueType,
    chosenCandidateId: textOrNull(row.chosen_candidate_id),
  };
};

const findTableRow = (client: PoolClient, caseId: string, fieldKey: string, rowKey: string) =>
  one(
    client,
    `SELECT r.id, r.field_id FROM table_row r JOIN field f ON f.id = r.field_id
     WHERE f.case_id = $1 AND f.key = $2 AND r.key = $3`,
    [caseId, fieldKey, rowKey],
  );

/**
 * A derived value only holds while the candidate it was computed from is still the chosen
 * one. When that stops being true the value is not merely unconfirmed, it is wrong, so it
 * is removed and the subfield falls back to having no value until a run produces it again.
 * Deleting the candidate is enough: the foreign keys clear chosen and confirmed for us,
 * and only for a subfield that actually pointed at it.
 */
const dropStaleDerived = async (client: PoolClient, caseId: string, run: number) => {
  const { rows } = await client.query<Row>(
    `SELECT d.id, d.subfield_id, s.field_id, s.chosen_candidate_id = d.id AS was_chosen
     FROM candidate d
     JOIN subfield s ON s.id = d.subfield_id
     JOIN candidate source ON source.id = d.source_candidate_id
     JOIN subfield origin ON origin.id = source.subfield_id
     JOIN field f ON f.id = s.field_id
     WHERE f.case_id = $1 AND d.tag = 'derived' AND origin.chosen_candidate_id IS DISTINCT FROM source.id`,
    [caseId],
  );

  for (const row of rows) {
    const subfieldId = text(row.subfield_id);
    if (row.was_chosen === true) {
      await client.query("UPDATE subfield SET absence_note = $1 WHERE id = $2", ["Quellwert gewechselt, Ableitung entfallen", subfieldId]);
    }
    await client.query("DELETE FROM candidate WHERE id = $1", [text(row.id)]);
    await writeHistory(client, text(row.field_id), { subfieldId }, run, "agent", "abgeleiteter Wert entfernt, weil der Quellwert gewechselt hat");
  }
};

/* ---------- Value-level actions ---------- */

/**
 * Confirms the value currently in the field. For a subfield the confirmation names one
 * candidate; a table row still stores its status directly, so there it is the status.
 */
export const confirmValue = (caseId: string, fieldKey: string, partKey: string) =>
  mutate(caseId, async (client, run) => {
    const subfield = await findSubfield(client, caseId, fieldKey, partKey);
    if (subfield) {
      if (subfield.chosenCandidateId === null) return;
      await client.query("UPDATE subfield SET confirmed_candidate_id = $1 WHERE id = $2", [subfield.chosenCandidateId, subfield.id]);
      await writeHistory(client, subfield.fieldId, { subfieldId: subfield.id }, run, "user", "Wert bestätigt");
      return;
    }

    const tableRow = await findTableRow(client, caseId, fieldKey, partKey);
    if (!tableRow) return;
    await client.query("UPDATE table_row SET status = 'confirmed' WHERE id = $1", [text(tableRow.id)]);
    await writeHistory(client, text(tableRow.field_id), { tableRowId: text(tableRow.id) }, run, "user", "Zeile bestätigt");
  });

/**
 * Puts a different candidate in the field. The confirmation is not cleared explicitly:
 * it still names the old candidate, so the status simply stops reading as confirmed.
 */
export const chooseCandidate = (caseId: string, candidateId: string) =>
  mutate(caseId, async (client, run) => {
    const row = await one(
      client,
      `SELECT c.id, c.value, c.subfield_id, c.table_row_id, f.id AS field_id
       FROM candidate c
       LEFT JOIN subfield s ON s.id = c.subfield_id
       LEFT JOIN table_row t ON t.id = c.table_row_id
       JOIN field f ON f.id = COALESCE(s.field_id, t.field_id)
       WHERE f.case_id = $1 AND c.id = $2`,
      [caseId, candidateId],
    );
    if (!row) return;

    const subfieldId = textOrNull(row.subfield_id);
    const tableRowId = textOrNull(row.table_row_id);
    if (subfieldId !== null) {
      await client.query("UPDATE subfield SET chosen_candidate_id = $1, absence_note = NULL WHERE id = $2", [candidateId, subfieldId]);
    } else if (tableRowId !== null) {
      await client.query("UPDATE table_row SET chosen_candidate_id = $1 WHERE id = $2", [candidateId, tableRowId]);
    }
    await writeHistory(client, text(row.field_id), { subfieldId, tableRowId }, run, "user", `anderen Wert gewählt: ${textOrNull(row.value) ?? "ohne Wert"}`);
    await dropStaleDerived(client, caseId, run);
  });

/**
 * Picks one of the competing readings of a passage that was not read cleanly.
 *
 * This is the point of the `Lesung unsicher` status: the model says it cannot tell a 6
 * from an 8, offers both, and a person looks at the scan and decides. The result is a
 * manual candidate -- a person chose it -- that keeps the Fundstelle of the reading it
 * came from, because the passage is still the source and the marker still points at it.
 * Only a value the model actually offered can be chosen; anything else is a correction
 * and goes through `correctSubfield`, where a reason is required.
 */
export const chooseReading = (caseId: string, candidateId: string, value: string) =>
  mutate(caseId, async (client, run) => {
    const row = await one(
      client,
      `SELECT c.*, s.id AS subfield_id_out, s.value_type, s.field_id
       FROM candidate c JOIN subfield s ON s.id = c.subfield_id JOIN field f ON f.id = s.field_id
       WHERE f.case_id = $1 AND c.id = $2`,
      [caseId, candidateId],
    );
    if (!row) return;

    const readings = (row.readings ?? []) as { value: string }[];
    if (!readings.some((reading) => reading.value === value)) return;

    const chosenId = randomUUID();
    await client.query(
      `INSERT INTO candidate (id, subfield_id, table_row_id, value, canonical_value, tag, document_id, page, quote,
                              source_label, note, source_class, crop, rationale, run, created_at)
       VALUES ($1, $2, NULL, $3, $4, 'manual', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        chosenId,
        text(row.subfield_id_out),
        value,
        canonicalize(value, text(row.value_type) as ValueType),
        textOrNull(row.document_id),
        row.page ?? null,
        textOrNull(row.quote),
        text(row.source_label),
        `Lesart gewählt von ${CLERK}`,
        textOrNull(row.source_class),
        row.crop ?? null,
        `Lesart gewählt: ${value}`,
        run,
        nowIso(),
      ],
    );
    await client.query("UPDATE subfield SET chosen_candidate_id = $1, absence_note = NULL WHERE id = $2", [
      chosenId,
      text(row.subfield_id_out),
    ]);
    await writeHistory(client, text(row.field_id), { subfieldId: text(row.subfield_id_out) }, run, "user", `Lesart gewählt: ${value}`);
    await dropStaleDerived(client, caseId, run);
  });

/** Corrects a value by hand. The reason is mandatory: without a document, it is the source. */
export const correctSubfield = (caseId: string, fieldKey: string, subfieldKey: string, value: string, reason: string) =>
  mutate(caseId, async (client, run) => {
    const subfield = await findSubfield(client, caseId, fieldKey, subfieldKey);
    if (!subfield || reason.trim() === "" || value.trim() === "") return;

    const candidateId = randomUUID();
    await client.query(
      `INSERT INTO candidate (id, subfield_id, table_row_id, value, canonical_value, tag, source_label, rationale, run, created_at)
       VALUES ($1, $2, NULL, $3, $4, 'manual', $5, $6, $7, $8)`,
      [candidateId, subfield.id, value, canonicalize(value, subfield.valueType), `manuell korrigiert von ${CLERK}`, reason, run, nowIso()],
    );
    await client.query("UPDATE subfield SET chosen_candidate_id = $1, absence_note = NULL WHERE id = $2", [candidateId, subfield.id]);
    await writeHistory(client, subfield.fieldId, { subfieldId: subfield.id }, run, "user", `manuell korrigiert: ${reason}`);
    await dropStaleDerived(client, caseId, run);
  });

/** Picks the procedure for one entry in Abteilung II or III. */
export const setProcedure = (caseId: string, fieldKey: string, rowKey: string, procedure: Procedure) =>
  mutate(caseId, async (client, run) => {
    const row = await findTableRow(client, caseId, fieldKey, rowKey);
    if (!row) return;

    await client.query("UPDATE table_row SET procedure = $1 WHERE id = $2", [procedure, text(row.id)]);
    await writeHistory(client, text(row.field_id), { tableRowId: text(row.id) }, run, "user", `Verfahren gewählt: ${PROCEDURE_META[procedure].label}`);
  });

/* ---------- The request basket ---------- */

/** The basket is a request row that has not been sent. There is at most one per case. */
const openDraft = async (client: PoolClient, caseId: string, run: number): Promise<string> => {
  const existing = await one(client, "SELECT id FROM request WHERE case_id = $1 AND sent_at IS NULL", [caseId]);
  if (existing) return text(existing.id);

  const requestId = randomUUID();
  await client.query("INSERT INTO request (id, case_id, run, sent_at, recipient, subject, body) VALUES ($1, $2, $3, NULL, '', '', '')", [
    requestId,
    caseId,
    run,
  ]);
  return requestId;
};

/** `shouldBeInBasket` is the state after the click, not the state before it. */
export const setBasketItem = (caseId: string, fieldKey: FieldId, shouldBeInBasket: boolean) =>
  mutate(caseId, async (client, run) => {
    const field = await one(client, "SELECT id, request_title, request_text FROM field WHERE case_id = $1 AND key = $2", [
      caseId,
      fieldKey,
    ]);
    // The run's own wording wins over the catalog template, so the position in the basket
    // reads the same as the finding it came from. See `requestOf` in repository.ts.
    const written = field === undefined ? null : textOrNull(field.request_title);
    const writtenText = field === undefined ? null : textOrNull(field.request_text);
    const template =
      written !== null && writtenText !== null ? { title: written, text: writtenText } : fieldDefinition(fieldKey)?.request;
    if (!field || !template) return;

    const requestId = await openDraft(client, caseId, run);
    if (shouldBeInBasket) {
      const next = await one(client, "SELECT COUNT(*) AS total FROM request_item WHERE request_id = $1", [requestId]);
      await client.query(
        `INSERT INTO request_item (id, request_id, field_id, title, text, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (request_id, field_id) DO NOTHING`,
        [randomUUID(), requestId, text(field.id), template.title, template.text, Number(text(next?.total))],
      );
    } else {
      await client.query("DELETE FROM request_item WHERE request_id = $1 AND field_id = $2", [requestId, text(field.id)]);
      // An empty basket is no basket; the draft row goes with its last position.
      await client.query("DELETE FROM request WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM request_item WHERE request_id = $1)", [
        requestId,
      ]);
    }
  });

/** Sends the basket. From here the case waits, and every position stays bound to its field. */
export const sendRequest = (caseId: string, recipient: string, subject: string, body: string) =>
  mutate(caseId, async (client, run) => {
    const draft = await one(client, "SELECT id FROM request WHERE case_id = $1 AND sent_at IS NULL", [caseId]);
    if (!draft) return;

    const { rows: items } = await client.query<Row>("SELECT field_id FROM request_item WHERE request_id = $1", [text(draft.id)]);
    if (items.length === 0) return;

    await client.query("UPDATE request SET sent_at = $1, recipient = $2, subject = $3, body = $4 WHERE id = $5", [
      nowIso(),
      recipient,
      subject,
      body,
      text(draft.id),
    ]);
    await client.query("UPDATE case_file SET phase = 'waiting' WHERE id = $1", [caseId]);

    for (const item of items) {
      await writeHistory(client, text(item.field_id), {}, run, "user", `angefordert bei ${recipient}`);
    }
  });
