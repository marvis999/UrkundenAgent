import { DocumentList } from "@/components/case/DocumentList";
import { DocumentViewer } from "@/components/case/DocumentViewer";
import { documentPageTexts } from "@/db/pages";
import { clampPage } from "@/domain/evidence";
import { loadCaseView, loadDocument, parsePage, type DocumentParams, type SearchParams } from "@/lib/load";
import { QUERY } from "@/lib/routes";

export default async function DocumentPage({ params, searchParams }: { params: DocumentParams; searchParams: SearchParams }) {
  const view = await loadCaseView(params);
  const document = await loadDocument(view, params);
  const query = await searchParams;
  const page = parsePage(query[QUERY.page]);

  // A document without page images is text, and the viewer shows the text instead. Read
  // here rather than in the case view: it is one document's worth of prose, and no other
  // page needs it.
  const texts = document.hasPages ? [] : await documentPageTexts(view.case.id, document.id);
  const text = texts.find((entry) => entry.number === clampPage(page, document.pageCount))?.text;

  return (
    <>
      <DocumentList view={view} />
      <DocumentViewer view={view} document={document} page={page} {...(text === undefined ? {} : { text })} />
    </>
  );
}
