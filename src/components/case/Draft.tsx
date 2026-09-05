import { Button } from "@/components/ui/Button";
import { ListItem } from "@/components/ui/ListItem";
import { Notice } from "@/components/ui/Notice";
import { Columns, Page, Stack } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Stacked } from "@/components/ui/Stacked";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, TRACK, type Column } from "@/components/ui/Table";
import { Text } from "@/components/ui/Text";
import { TonedIcon } from "@/components/ui/TonedIcon";
import { workspace } from "@/data/workspace";
import { draftStamp } from "@/domain/derive";
import { clauseViews, draftGaps, type ClauseView } from "@/domain/draft";
import type { CaseView } from "@/domain/model";
import { FIELD_STATUS_META } from "@/domain/status";

const clauseColumns: readonly Column<ClauseView>[] = [
  { id: "number", width: "48px", render: (c) => <Text variant="mono">{c.clause.number}</Text> },
  { id: "title", width: TRACK.fill, render: (c) => <Stacked title={c.clause.title} subtitle={c.value} emphasis="strong" /> },
  { id: "status", width: "auto", align: "end", render: (c) => <StatusBadge meta={FIELD_STATUS_META[c.status]} /> },
];

interface DraftProps {
  view: CaseView;
}

/** The Entwurf tab: clause mapping, gaps, export. Shows the assignment, not the deed. */
export function Draft({ view }: DraftProps) {
  const stamp = draftStamp(view.fields);
  const clauses = clauseViews(view.clauses, view.fields);
  const gaps = draftGaps(view.fields);

  return (
    <Page>
      <Notice tone={stamp.tone} icon={stamp.icon} text={stamp.text} size="prominent" />
      <Columns
        aside={
          <>
            <Stack gap="tight">
              <SectionHeading>Was nicht im Entwurf steht</SectionHeading>
              {gaps.length === 0 && <Text variant="muted">Alle Unterfelder haben eine Quelle.</Text>}
              {gaps.map((gap) => {
                const meta = FIELD_STATUS_META[gap.status];
                return <ListItem key={gap.id} leading={<TonedIcon tone={meta.tone} name={meta.icon} />} title={gap.title} description={gap.text} />;
              })}
            </Stack>
            <Stack gap="tight">
              <Button variant="secondary" icon="download">
                Entwurf erzeugen
              </Button>
              <Button variant="accent" icon="download">
                Datensatz als JSON
              </Button>
            </Stack>
          </>
        }
      >
        <PageTitle summary={`Vorlage: ${workspace.draftTemplate}`}>Kaufvertragsentwurf</PageTitle>
        <Table columns={clauseColumns} rows={clauses} rowKey={(c) => c.clause.number} />
      </Columns>
    </Page>
  );
}
