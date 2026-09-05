import { fieldStatus, worstStatus } from "./derive";
import type { Clause, Field } from "./model";
import { FIELD_STATUS_META, type FieldStatus } from "./status";

export interface ClauseView {
  clause: Clause;
  fields: Field[];
  value: string;
  status: FieldStatus;
}

export const clauseViews = (clauses: readonly Clause[], fields: readonly Field[]): ClauseView[] =>
  clauses.map((clause) => {
    const clauseFields = clause.fieldIds.flatMap((id) => fields.filter((f) => f.id === id));
    return {
      clause,
      fields: clauseFields,
      value: clauseFields.map((f) => f.shortValue).join(", "),
      status: worstStatus(clauseFields.map(fieldStatus)),
    };
  });

export interface DraftGap {
  id: string;
  title: string;
  text: string;
  status: FieldStatus;
}

/** Subfields that carry no source and therefore cannot appear in the draft. */
export const draftGaps = (fields: readonly Field[]): DraftGap[] =>
  fields.flatMap((field) =>
    field.subfields
      .filter((s) => FIELD_STATUS_META[s.status].hasNoSource)
      .map((s) => ({ id: `${field.id}.${s.id}`, title: `${field.label}: ${s.label}`, text: s.sourceLabel, status: s.status })),
  );
