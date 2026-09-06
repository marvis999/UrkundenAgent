import { CATALOG_VERSION, FIELD_CATALOG, subfieldDefaults } from "@/catalog/fields";
import { nowIso, todayIso } from "@/lib/clock";
import { int, query, transaction, type Row } from "./connect";

/**
 * Opening a case.
 *
 * The catalog is the authority, so this is the one place a case gets its shape: every
 * field and subfield of the deed is written out at creation, empty, with the deadlines
 * and thresholds the catalog states. The case records the catalog version it was opened
 * with, so a later change to the catalog leaves older cases as they were.
 *
 * Nothing about the property is asked for. A notary knows the file by its number and by
 * the address, and the address is in the documents -- so it is left empty and the first
 * run fills it in, the same way every other value arrives.
 */

const SEQUENCE_DIGITS = 4;

export interface NewCase {
  readonly name: string;
}

const nextSequence = async (year: string): Promise<number> => {
  const rows = await query("SELECT id FROM case_file WHERE id LIKE $1", `${year}-%`);
  const numbers = rows.map((row: Row) => int(String(row.id).slice(year.length + 1)));
  return (numbers.length === 0 ? 0 : Math.max(...numbers)) + 1;
};

const writeCase = async (caseId: string, fileNumber: string, name: string) =>
  transaction(async (client) => {
    await client.query(
      `INSERT INTO case_file (id, name, file_number, property, phase, current_run, catalog_version,
                              recipient_name, recipient_email, changed_at)
       VALUES ($1, $2, $3, '', 'review', 0, $4, '', '', $5)`,
      [caseId, name, fileNumber, CATALOG_VERSION, nowIso()],
    );

    for (const [fieldIndex, definition] of FIELD_CATALOG.entries()) {
      const fieldId = `${caseId}:${definition.key}`;
      await client.query(
        "INSERT INTO field (id, case_id, key, label, group_key, sort_order, kind) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [fieldId, caseId, definition.key, definition.label, definition.groupKey, fieldIndex, definition.kind],
      );

      for (const [subfieldIndex, subfield] of definition.subfields.entries()) {
        const defaults = subfieldDefaults(subfield);
        await client.query(
          `INSERT INTO subfield (id, field_id, key, label, sort_order, value_type,
                                 stale_after_days, stale_when_value_in_past, confidence_threshold, absence_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            `${fieldId}.${subfield.key}`,
            fieldId,
            subfield.key,
            subfield.label,
            subfieldIndex,
            subfield.valueType,
            defaults.staleAfterDays,
            defaults.staleWhenValueInPast,
            defaults.confidenceThreshold,
            // Every value starts without one, and says so rather than showing an empty
            // line. The first run replaces this with what it actually looked for.
            "noch keine Unterlagen im Vorgang",
          ],
        );
      }
    }
  });

/**
 * Creates an empty case and returns its id.
 *
 * The id is the file's name in every other system a notary uses -- year and a running
 * number -- and the Urkundenrolle number follows it, so the two cannot disagree.
 */
export const createCase = async (input: NewCase): Promise<string> => {
  const year = todayIso().slice(0, 4);
  const sequence = await nextSequence(year);
  const caseId = `${year}-${String(sequence).padStart(SEQUENCE_DIGITS, "0")}`;
  // Two cases opened in the same second would collide on the primary key and the second
  // one would fail loudly. One office, one clerk: not worth a retry that never runs.
  await writeCase(caseId, `UR II ${sequence}/${year}`, input.name);
  return caseId;
};
