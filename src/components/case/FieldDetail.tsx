import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Stack } from "@/components/ui/Page";
import { Stacked } from "@/components/ui/Stacked";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column, type RowDetail } from "@/components/ui/Table";
import { defaultPartId, hasEvidence } from "@/domain/derive";
import type { CandidateTarget, CaseView, EncumbranceRow, Field, ParcelRow, ReviewPart, Subfield } from "@/domain/model";
import { FIELD_STATUS_META, PROCEDURE_META } from "@/domain/status";
import { PART_NONE, routes } from "@/lib/routes";
import { HistoryList, PartDetail } from "./PartDetail";
import styles from "./FieldDetail.module.css";

const NO_VALUE = "kein Wert";

const subfieldTarget = (s: Subfield): CandidateTarget => ({ kind: "subfield", subfieldId: s.id });
const rowTarget = (r: ParcelRow | EncumbranceRow): CandidateTarget => ({ kind: "row", rowId: r.id });

const status = <Row extends { status: Subfield["status"] }>(): Column<Row> => ({
  id: "status",
  header: "Status",
  width: "150px",
  align: "end",
  render: (r) => <StatusBadge meta={FIELD_STATUS_META[r.status]} />,
});

const subfieldColumns = (field: Field): readonly Column<Subfield>[] => [
  { id: "label", width: "186px", render: (s) => <span className={styles.label}>{s.label}</span> },
  { id: "value", width: "minmax(0, 1fr)", render: (s) => <span className={s.value ? styles.strong : styles.noValue}>{s.value ?? NO_VALUE}</span> },
  { id: "source", width: "196px", render: (s) => <span className={styles.muted}>{s.sourceLabel}</span> },
  {
    id: "evidence",
    width: "124px",
    render: (s) => {
      const found = hasEvidence(field, subfieldTarget(s));
      return (
        <span className={styles.evidence}>
          <Icon name={found ? "file-search" : "circle-minus"} size="sm" />
          {found ? "Fundstelle" : "ohne Fundstelle"}
        </span>
      );
    },
  },
  status<Subfield>(),
];

const parcelColumns: readonly Column<ParcelRow>[] = [
  { id: "district", header: "Gemarkung", width: "minmax(0, 1fr)", render: (r) => r.district },
  { id: "section", header: "Flur", width: "60px", render: (r) => r.section },
  { id: "parcel", header: "Flurstück", width: "90px", render: (r) => r.parcel },
  { id: "size", header: "Größe", width: "100px", render: (r) => r.size },
  { id: "landUse", header: "Wirtschaftsart", width: "minmax(0, 1.4fr)", render: (r) => r.landUse },
  status<ParcelRow>(),
];

const encumbranceColumns: readonly Column<EncumbranceRow>[] = [
  { id: "entry", header: "Abteilung", width: "120px", render: (r) => <span className={styles.strong}>{r.entry}</span> },
  {
    id: "text",
    header: "Eintragung",
    width: "minmax(0, 1fr)",
    render: (r) => <Stacked title={r.text} subtitle={r.procedure ? PROCEDURE_META[r.procedure].consequence : r.proofLine} />,
  },
  {
    id: "procedure",
    header: "Verfahren",
    width: "120px",
    render: (r) => <span className={r.procedure ? styles.strong : styles.muted}>{r.procedure ? PROCEDURE_META[r.procedure].label : "offen"}</span>,
  },
  status<EncumbranceRow>(),
];

interface FieldDetailProps {
  view: CaseView;
  field: Field;
  /** Undefined opens the default part; PART_NONE keeps every part closed. */
  activePartId?: string;
  showManualForm?: boolean;
}

/** The expanded field: its subfields and table rows, each expandable into its own PartDetail. */
export function FieldDetail({ view, field, activePartId, showManualForm }: FieldDetailProps) {
  const openId = activePartId ?? defaultPartId(field);
  const caseId = view.case.id;
  const isOpen = (partId: string) => partId === openId;
  const tone = (r: { status: Subfield["status"] }) => FIELD_STATUS_META[r.status].tone;

  /** Wraps a PartDetail into the table's row-detail contract, with URLs mirroring the open part. */
  const detail = (part: ReviewPart, content: ReactNode): RowDetail => ({
    content,
    open: isOpen(part.id),
    openHref: routes.case(caseId, field.id, { part: part.id }),
    closedHref: routes.case(caseId, field.id, { part: PART_NONE }),
  });

  return (
    <div className={styles.detail}>
      <Table
        columns={subfieldColumns(field)}
        rows={field.subfields}
        rowKey={(s) => s.id}
        rowTone={tone}
        rowDetail={(s) =>
          detail(
            s,
            <PartDetail
              view={view}
              field={field}
              part={s}
              target={subfieldTarget(s)}
              noEvidenceText={s.sourceLabel}
              currentValue={s.value ?? ""}
              showManualForm={showManualForm && isOpen(s.id)}
            />,
          )
        }
        density="compact"
      />

      {field.table?.kind === "parcels" && (
        <Table
          columns={parcelColumns}
          rows={field.table.rows}
          rowKey={(r) => r.id}
          rowTone={tone}
          rowDetail={(r) =>
            detail(
              r,
              <PartDetail
                view={view}
                field={field}
                part={r}
                target={rowTarget(r)}
                noEvidenceText="Flurstück ohne Fundstelle in den Unterlagen."
                currentValue={r.landUse}
                showManualForm={showManualForm && isOpen(r.id)}
              />,
            )
          }
          showHeader
          density="compact"
        />
      )}

      {field.table?.kind === "encumbrances" && (
        <Table
          columns={encumbranceColumns}
          rows={field.table.rows}
          rowKey={(r) => r.id}
          rowTone={tone}
          rowDetail={(r) =>
            detail(
              r,
              <PartDetail
                view={view}
                field={field}
                part={r}
                target={rowTarget(r)}
                noEvidenceText="Eintragung ohne Fundstelle in den Unterlagen."
                currentValue={r.text}
                encumbrance={r}
                showManualForm={showManualForm && isOpen(r.id)}
              />,
            )
          }
          showHeader
          density="compact"
        />
      )}

      {field.history.length > 0 && (
        <Stack gap="tight">
          <HistoryList entries={field.history} />
        </Stack>
      )}
    </div>
  );
}
