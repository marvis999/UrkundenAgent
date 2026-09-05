import { Distribution } from "@/components/ui/Distribution";
import { Page } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/PageTitle";
import { overviewCounts, overviewSummary } from "@/domain/derive";
import type { CaseView, FieldId } from "@/domain/model";
import { routes } from "@/lib/routes";
import { AnalysisStrip } from "./AnalysisStrip";
import { FieldList } from "./FieldList";

interface DeedDataProps {
  view: CaseView;
  activeFieldId?: FieldId;
  activePartId?: string;
}

/** The Urkundendaten tab. */
export function DeedData({ view, activeFieldId, activePartId }: DeedDataProps) {
  return (
    <Page>
      {view.case.phase === "analysis" && <AnalysisStrip view={view} />}
      <PageTitle summary={overviewSummary(view.fields)}>Urkundendaten</PageTitle>
      <Distribution
        counts={overviewCounts(view.fields)}
        hrefFor={(c) => (c.firstFieldId ? routes.case(view.case.id, c.firstFieldId, { anchor: true }) : undefined)}
      />
      <FieldList view={view} activeFieldId={activeFieldId} activePartId={activePartId} />
    </Page>
  );
}
