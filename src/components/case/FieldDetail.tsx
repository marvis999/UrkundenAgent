import { Icon } from "@/components/ui/Icon";
import { Stacked } from "@/components/ui/Stacked";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TRACK, type Column } from "@/components/ui/Table";
import { Text } from "@/components/ui/Text";
import { defaultPartId, hasEvidence } from "@/domain/derive";
import type { CaseView, EncumbranceRow, Field, ParcelRow, ReviewPart, Subfield } from "@/domain/model";
import { FIELD_STATUS_META, PROCEDURE_META } from "@/domain/status";
import { HistoryList } from "./HistoryList";
import { PartTable } from "./PartTable";
import styles from "./FieldDetail.module.css";

const NO_VALUE = "kein Wert";

const statusColumn = <Row extends ReviewPart>(): Column<Row> => ({
  id: "status",
  header: "Status",
  width: TRACK.status,
  align: "end",
  render: (r) => <StatusBadge meta={FIELD_STATUS_META[r.status]} />,
});

const subfieldColumns = (field: Field): readonly Column<Subfield>[] => [
  { id: "label", width: "186px", render: (s) => <Text variant="label">{s.label}</Text> },
  { id: "value", width: TRACK.fill, render: (s) => (s.value ? <Text variant="strong">{s.value}</Text> : <Text variant="placeholder">{NO_VALUE}</Text>) },
  { id: "source", width: "196px", render: (s) => <Text variant="muted">{s.sourceLabel}</Text> },
  {
    id: "evidence",
    width: "124px",
    render: (s) => {
      const found = hasEvidence(field, { kind: "subfield", subfieldId: s.id });
      return (
        <span className={styles.evidence}>
          <Icon name={found ? "file-search" : "circle-minus"} size="sm" />
          {found ? "Fundstelle" : "ohne Fundstelle"}
        </span>
      );
    },
  },
  statusColumn<Subfield>(),
];

const parcelColumns: readonly Column<ParcelRow>[] = [
  { id: "district", header: "Gemarkung", width: TRACK.fill, render: (r) => r.district },
  { id: "section", header: "Flur", width: "60px", render: (r) => r.section },
  { id: "parcel", header: "Flurstück", width: "90px", render: (r) => r.parcel },
  { id: "size", header: "Größe", width: "100px", render: (r) => r.size },
  { id: "landUse", header: "Wirtschaftsart", width: "minmax(0, 1.4fr)", render: (r) => r.landUse },
  statusColumn<ParcelRow>(),
];

const encumbranceColumns: readonly Column<EncumbranceRow>[] = [
  { id: "entry", header: "Abteilung", width: TRACK.narrow, render: (r) => <Text variant="strong">{r.entry}</Text> },
  {
    id: "text",
    header: "Eintragung",
    width: TRACK.fill,
    render: (r) => <Stacked title={r.text} subtitle={r.procedure ? PROCEDURE_META[r.procedure].consequence : r.proofLine} />,
  },
  {
    id: "procedure",
    header: "Verfahren",
    width: TRACK.narrow,
    render: (r) => (r.procedure ? <Text variant="strong">{PROCEDURE_META[r.procedure].label}</Text> : <Text variant="muted">offen</Text>),
  },
  statusColumn<EncumbranceRow>(),
];

interface FieldDetailProps {
  view: CaseView;
  field: Field;
  /** Undefined opens the default part; PART_NONE keeps every part closed. */
  activePartId?: string;
}

/** The expanded field: its subfields and table rows, each expandable into its own PartDetail. */
export function FieldDetail({ view, field, activePartId }: FieldDetailProps) {
  const openId = activePartId ?? defaultPartId(field);
  const shared = { view, field, openId };

  return (
    <div className={styles.detail}>
      <PartTable
        {...shared}
        rows={field.subfields}
        columns={subfieldColumns(field)}
        label={(s) => s.label}
        target={(s) => ({ kind: "subfield", subfieldId: s.id })}
        noEvidenceText={(s) => s.sourceLabel}
        currentValue={(s) => s.value ?? ""}
      />

      {field.table?.kind === "parcels" && (
        <PartTable
          {...shared}
          rows={field.table.rows}
          columns={parcelColumns}
          label={(r) => `Flurstück ${r.parcel}`}
          target={(r) => ({ kind: "row", rowId: r.id })}
          noEvidenceText={() => "Flurstück ohne Fundstelle in den Unterlagen."}
          currentValue={(r) => r.landUse}
          showHeader
        />
      )}

      {field.table?.kind === "encumbrances" && (
        <PartTable
          {...shared}
          rows={field.table.rows}
          columns={encumbranceColumns}
          label={(r) => r.entry}
          target={(r) => ({ kind: "row", rowId: r.id })}
          noEvidenceText={() => "Eintragung ohne Fundstelle in den Unterlagen."}
          currentValue={(r) => r.text}
          encumbrance={(r) => r}
          showHeader
        />
      )}

      {field.history.length > 0 && <HistoryList entries={field.history} />}
    </div>
  );
}
