import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Page } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/PageTitle";
import { Stacked } from "@/components/ui/Stacked";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, TRACK, type Column } from "@/components/ui/Table";
import { Text } from "@/components/ui/Text";
import { Brand, TopBar, UserChip } from "@/components/ui/TopBar";
import { listCases } from "@/db/repository";
import { workspace } from "@/data/workspace";
import { caseListSummary } from "@/domain/cases";
import type { Case } from "@/domain/model";
import { CASE_STATUS_META } from "@/domain/status";
import { routes } from "@/lib/routes";

const caseColumns: readonly Column<Case>[] = [
  { id: "name", width: TRACK.fill, render: (c) => <Stacked title={c.name} subtitle={c.property} emphasis="strong" /> },
  { id: "fileNumber", width: TRACK.status, render: (c) => <Text variant="mono">{c.fileNumber}</Text> },
  { id: "status", width: "220px", render: (c) => <StatusBadge meta={CASE_STATUS_META[c.status]} /> },
  { id: "changedAt", width: "116px", render: (c) => <Text variant="muted">{c.changedAt}</Text> },
  { id: "chevron", width: "auto", render: () => <Text variant="muted"><Icon name="chevron-right" /></Text> },
];

export default async function CaseListPage() {
  const cases = await listCases();
  return (
    <>
      <TopBar start={<Brand name={workspace.productName} office={workspace.officeName} />} end={<UserChip initials={workspace.userInitials} />} />
      <Page>
        <PageTitle
          summary={caseListSummary(cases)}
          actions={
            <Button variant={cases.length === 0 ? "accent" : "secondary"} icon="plus" href={routes.newCase()}>
              Neuer Vorgang
            </Button>
          }
        >
          Vorgänge
        </PageTitle>
        <Table
          columns={caseColumns}
          rows={cases}
          rowKey={(c) => c.id}
          rowHref={(c) => routes.case(c.id)}
          emptyText="Noch kein Vorgang. Neuer Vorgang legt einen an: ein Name genügt, alles Weitere kommt aus den Unterlagen."
        />
      </Page>
    </>
  );
}
