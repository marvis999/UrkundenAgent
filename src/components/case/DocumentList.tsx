import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ListItem } from "@/components/ui/ListItem";
import { Notice } from "@/components/ui/Notice";
import { Page, Stack } from "@/components/ui/Page";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Stacked } from "@/components/ui/Stacked";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column } from "@/components/ui/Table";
import { documentPageCount, photoCount } from "@/domain/evidence";
import type { CaseView, Document } from "@/domain/model";
import { DOCUMENT_KIND_ICON, DOCUMENT_STATUS_META, REQUEST_OUTCOME_META } from "@/domain/status";
import { formatRun } from "@/lib/format";
import { routes } from "@/lib/routes";
import styles from "./DocumentList.module.css";

const documentColumns: readonly Column<Document>[] = [
  { id: "icon", width: "auto", render: (d) => <span className={styles.icon}><Icon name={DOCUMENT_KIND_ICON[d.kind]} size="lg" /></span> },
  { id: "name", width: "minmax(0, 2fr)", render: (d) => <Stacked title={d.fileName} subtitle={d.quality} emphasis="strong" /> },
  { id: "type", width: "minmax(0, 1fr)", render: (d) => d.type },
  { id: "date", width: "100px", render: (d) => <span className={styles.muted}>{d.date}</span> },
  { id: "pages", width: "80px", render: (d) => <span className={styles.muted}>{d.pageCount === 1 ? "1 Seite" : `${d.pageCount} Seiten`}</span> },
  { id: "status", width: "auto", align: "end", render: (d) => <StatusBadge meta={DOCUMENT_STATUS_META[d.status]} /> },
  { id: "chevron", width: "auto", render: () => <span className={styles.muted}><Icon name="chevron-right" /></span> },
];

interface DocumentListProps {
  view: CaseView;
}

/** The Unterlagen tab: files, upload zone, run log. */
export function DocumentList({ view }: DocumentListProps) {
  const { documents, runs } = view;
  const summary = `${documents.length} Dateien, ${documentPageCount(documents)} Seiten, ${photoCount(documents)} davon Fotos`;

  return (
    <Page>
      <PageTitle summary={summary}>Unterlagen</PageTitle>
      <Table
        columns={documentColumns}
        rows={documents}
        rowKey={(d) => d.id}
        rowHref={(d) => routes.document(view.case.id, d.id)}
        rowTone={(d) => (d.isNew ? "accent" : undefined)}
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
        {runs.length === 0 && <span className={styles.muted}>Noch kein Durchlauf.</span>}
        {runs.map((run) => (
          <div key={run.number} className={styles.run}>
            <div className={styles.runHeader}>
              <Badge tone="accent">{formatRun(run.number)}</Badge>
              <span className={styles.muted}>{run.at}</span>
            </div>
            <span>{run.summary}</span>
            {run.items.map((item) => {
              const meta = REQUEST_OUTCOME_META[item.outcome];
              return (
                <ListItem
                  key={item.fieldId}
                  leading={
                    <span data-tone={meta.tone} className={styles.outcomeIcon}>
                      <Icon name={meta.icon} />
                    </span>
                  }
                  title={item.title}
                  description={item.resolvedBy}
                  trailing={<Badge tone={meta.tone}>{meta.label}</Badge>}
                />
              );
            })}
          </div>
        ))}
      </Stack>
    </Page>
  );
}
