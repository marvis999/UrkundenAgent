import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Page, Stack } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Stacked } from "@/components/ui/Stacked";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, TRACK, type Column } from "@/components/ui/Table";
import { Text } from "@/components/ui/Text";
import { documentPageCount, photoCount } from "@/domain/evidence";
import type { CaseView, Document } from "@/domain/model";
import { DOCUMENT_KIND_ICON, DOCUMENT_STATUS_META } from "@/domain/status";
import { formatFiles, formatPages } from "@/lib/format";
import { routes } from "@/lib/routes";
import { RunLogEntry } from "./RunLogEntry";
import styles from "./DocumentList.module.css";

const documentColumns: readonly Column<Document>[] = [
  { id: "icon", width: "auto", render: (d) => <span className={styles.kind}><Icon name={DOCUMENT_KIND_ICON[d.kind]} size="lg" /></span> },
  {
    id: "name",
    width: "minmax(0, 2fr)",
    render: (d) => (
      <Stacked
        title={
          <>
            {d.fileName}
            {d.isNew && <Badge tone="accent">neu</Badge>}
          </>
        }
        subtitle={d.quality}
        emphasis="strong"
      />
    ),
  },
  { id: "type", width: TRACK.fill, render: (d) => d.type },
  { id: "date", width: "100px", render: (d) => <Text variant="muted">{d.date}</Text> },
  { id: "pages", width: "80px", render: (d) => <Text variant="muted">{formatPages(d.pageCount)}</Text> },
  { id: "status", width: "auto", align: "end", render: (d) => <StatusBadge meta={DOCUMENT_STATUS_META[d.status]} /> },
  { id: "chevron", width: "auto", render: () => <span className={styles.kind}><Icon name="chevron-right" /></span> },
];

interface DocumentListProps {
  view: CaseView;
}

/** The Unterlagen tab: files, upload zone, run log. */
export function DocumentList({ view }: DocumentListProps) {
  const { documents, runs } = view;
  const summary = `${formatFiles(documents.length)}, ${formatPages(documentPageCount(documents))}, ${photoCount(documents)} davon Fotos`;

  return (
    <Page>
      <PageTitle summary={summary}>Unterlagen</PageTitle>
      <Table
        columns={documentColumns}
        rows={documents}
        rowKey={(d) => d.id}
        rowHref={(d) => routes.document(view.case.id, d.id)}
        emptyText="Noch keine Unterlagen. Legen Sie Dateien ab, um den ersten Durchlauf zu starten."
      />
      <Notice
        tone="neutral"
        icon="upload"
        text="Weitere Unterlagen hier ablegen. Sie landen im nächsten Durchlauf."
        surface="plain"
        actions={<Button variant="secondary">Auswählen</Button>}
      />
      <Stack gap="tight">
        <SectionHeading>Durchläufe</SectionHeading>
        {runs.length === 0 && <Text variant="muted">Noch kein Durchlauf.</Text>}
        {runs.map((run) => (
          <RunLogEntry key={run.number} run={run} />
        ))}
      </Stack>
    </Page>
  );
}
