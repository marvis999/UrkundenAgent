import { DocumentList } from "@/components/case/DocumentList";
import { loadCaseView, type CaseParams } from "@/lib/load";

export default async function DocumentsPage({ params }: { params: CaseParams }) {
  const view = await loadCaseView(params);
  return <DocumentList view={view} />;
}
