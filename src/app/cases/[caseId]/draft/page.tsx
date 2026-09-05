import { Draft } from "@/components/case/Draft";
import { loadCaseView, type CaseParams } from "@/lib/load";

export default async function DraftPage({ params }: { params: CaseParams }) {
  const view = await loadCaseView(params);
  return <Draft view={view} />;
}
