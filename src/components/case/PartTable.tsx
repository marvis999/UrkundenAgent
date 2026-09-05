import { Table, type Column } from "@/components/ui/Table";
import type { CandidateTarget, CaseView, EncumbranceRow, Field, ReviewPart } from "@/domain/model";
import { PART_NONE, partAnchor, routes } from "@/lib/routes";
import { PartDetail } from "./PartDetail";

interface PartTableProps<Row extends ReviewPart> {
  view: CaseView;
  field: Field;
  rows: readonly Row[];
  columns: readonly Column<Row>[];
  /** Id of the part currently expanded, if any. */
  openId?: string;
  showHeader?: boolean;
  label: (row: Row) => string;
  target: (row: Row) => CandidateTarget;
  noEvidenceText: (row: Row) => string;
  currentValue: (row: Row) => string;
  encumbrance?: (row: Row) => EncumbranceRow;
}

/** A table of review parts (subfields or table rows) where each row expands into its PartDetail. */
export function PartTable<Row extends ReviewPart>({
  view,
  field,
  rows,
  columns,
  openId,
  showHeader,
  label,
  target,
  noEvidenceText,
  currentValue,
  encumbrance,
}: PartTableProps<Row>) {
  const caseId = view.case.id;
  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowDetail={(r) => ({
        id: partAnchor(field.id, r.id),
        open: r.id === openId,
        openHref: routes.case(caseId, field.id, { part: r.id }),
        closedHref: routes.case(caseId, field.id, { part: PART_NONE }),
        content: (
          <PartDetail
            view={view}
            field={field}
            part={r}
            label={label(r)}
            target={target(r)}
            noEvidenceText={noEvidenceText(r)}
            currentValue={currentValue(r)}
            encumbrance={encumbrance?.(r)}
          />
        ),
      })}
      showHeader={showHeader}
      density="compact"
    />
  );
}
