import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Page } from "@/components/ui/Page";
import { PageTitle } from "@/components/ui/PageTitle";
import { Stacked } from "@/components/ui/Stacked";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column } from "@/components/ui/Table";
import { BrandMark, TopBar, UserChip } from "@/components/ui/TopBar";
import { listCases } from "@/data/mock";
import { workspace } from "@/data/workspace";
import { caseListSummary } from "@/domain/cases";
import type { Case } from "@/domain/model";
import { CASE_STATUS_META } from "@/domain/status";
import { routes } from "@/lib/routes";
import styles from "./page.module.css";

const caseColumns: readonly Column<Case>[] = [
  { id: "name", width: "minmax(0, 1fr)", render: (c) => <Stacked title={c.name} subtitle={c.property} emphasis="strong" /> },
  { id: "fileNumber", width: "150px", render: (c) => <span className={styles.fileNumber}>{c.fileNumber}</span> },
  { id: "status", width: "220px", render: (c) => <StatusBadge meta={CASE_STATUS_META[c.status]} /> },
  { id: "changedAt", width: "116px", render: (c) => <span className={styles.muted}>{c.changedAt}</span> },
  { id: "chevron", width: "auto", render: () => <span className={styles.muted}><Icon name="chevron-right" /></span> },
];

export default function CaseListPage() {
  const cases = listCases();
  return (
    <>
      <TopBar
        start={
          <>
            <BrandMark />
            <span className={styles.product}>{workspace.productName}</span>
            <span className={styles.office}>{workspace.officeName}</span>
          </>
        }
        end={<UserChip initials={workspace.userInitials} />}
      />
      <Page>
        <PageTitle
          summary={caseListSummary(cases)}
          actions={
            <Button variant="secondary" icon="plus" href={routes.newCase()}>
              Neuer Vorgang
            </Button>
          }
        >
          Vorgänge
        </PageTitle>
        <Table columns={caseColumns} rows={cases} rowKey={(c) => c.id} rowHref={(c) => routes.case(c.id)} />
      </Page>
    </>
  );
}
