import { DocumentList } from "@/components/case/DocumentList";
import { DocumentViewer } from "@/components/case/DocumentViewer";
import { loadCaseView, loadDocument, parsePage, type DocumentParams, type SearchParams } from "@/lib/load";
import { QUERY } from "@/lib/routes";

export default async function DocumentPage({ params, searchParams }: { params: DocumentParams; searchParams: SearchParams }) {
  const view = await loadCaseView(params);
  const document = await loadDocument(view, params);
  const query = await searchParams;
  return (
    <>
      <DocumentList view={view} />
      <DocumentViewer view={view} document={document} page={parsePage(query[QUERY.page])} />
    </>
  );
}
