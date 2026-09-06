import { chooseCandidateAction, turnPageAction } from "@/app/actions";
import { ActionForm } from "@/components/ui/ActionForm";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Overlay } from "@/components/ui/Overlay";
import { PageIndicators, type PageIndicator } from "@/components/ui/PageIndicators";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Text } from "@/components/ui/Text";
import { candidateOnPage, clampPage, pagesWithEvidence } from "@/domain/evidence";
import type { CaseView, Document } from "@/domain/model";
import { DOCUMENT_KIND_ICON, DOCUMENT_STATUS_META } from "@/domain/status";
import { routes } from "@/lib/routes";
import { ImageFrame } from "./ImageFrame";
import styles from "./DocumentViewer.module.css";

interface DocumentViewerProps {
  view: CaseView;
  document: Document;
  page: number;
  /** The page's own text, for a document that is text and has no image to show. */
  text?: string;
  /** Where closing goes: the value this was opened from, else the Unterlagen tab. */
  closeTo?: string;
}

/** Modal viewer: photos as image with marker, text pages with the highlighted passage. */
export function DocumentViewer({ view, document, page: requestedPage, text: pageText, closeTo }: DocumentViewerProps) {
  const caseId = view.case.id;
  const page = clampPage(requestedPage, document.pageCount);
  const hits = pagesWithEvidence(view, document.id);
  const located = candidateOnPage(view, document.id, page);
  const isPhoto = document.kind === "photo";
  const pageHref = (n: number) => routes.document(caseId, document.id, clampPage(n, document.pageCount), closeTo);
  // A rendered page is shown as its image; a text document has none and shows its text.
  const pageSrc = document.hasPages ? routes.pageImage(caseId, document.id, page) : undefined;

  const thumbnails: PageIndicator[] = Array.from({ length: document.pageCount }, (_, i) => {
    const number = i + 1;
    return { number, state: number === page ? "current" : hits.has(number) ? "hit" : "pending", href: pageHref(number) };
  });

  return (
    <Overlay
      closeHref={closeTo ?? routes.caseDocuments(caseId)}
      title={
        <>
          <Icon name={DOCUMENT_KIND_ICON[document.kind]} size="lg" />
          <span>{document.fileName}</span>
          <StatusBadge meta={DOCUMENT_STATUS_META[document.status]} />
        </>
      }
      headerEnd={
        <>
          <Button variant="ghost" icon="chevron-left" href={pageHref(page - 1)} disabled={page === 1} label="Vorherige Seite" />
          <Text variant="muted">
            Seite {page} von {document.pageCount}
          </Text>
          <Button variant="ghost" icon="chevron-right" href={pageHref(page + 1)} disabled={page === document.pageCount} label="Nächste Seite" />
          {/* The override for a turn the run got wrong or missed; the markers turn with the page. */}
          {pageSrc && (
            <ActionForm action={turnPageAction} values={{ case: caseId, document: document.id, page: String(page) }}>
              <Button variant="ghost" icon="rotate-cw" submit label="Seite um 90° drehen" />
            </ActionForm>
          )}
        </>
      }
      footer={
        located && (
          <>
            {/* The same act as choosing the candidate on its card, from the other side:
                here you are looking at the page and deciding the value it carries. */}
            <ActionForm action={chooseCandidateAction} values={{ case: caseId, candidate: located.candidate.id }}>
              <Button variant="accent" icon="check" submit disabled={located.candidate.isActive}>
                {located.candidate.isActive ? "Im Feld" : "Fundstelle übernehmen"}
              </Button>
            </ActionForm>
            <Text variant="muted">
              {located.field.label}: {located.candidate.value}
            </Text>
          </>
        )
      }
    >
      <div className={styles.layout}>
        <div className={styles.thumbs}>
          <PageIndicators pages={thumbnails} variant="thumbnails" paper={isPhoto ? "photo" : "text"} />
        </div>
        <div className={styles.stage}>
          {pageSrc ? (
            <div className={styles.photo}>
              <ImageFrame src={pageSrc} crop={located?.candidate.image?.crop} caption={document.type} size="page" />
            </div>
          ) : (
            <div className={styles.sheet}>
              <div className={styles.sheetHeader}>
                <Text variant="strong">{document.fileName}</Text>
                <Text variant="muted">
                  {document.type}, {document.date}
                </Text>
              </div>
              {/* A note is shown as what it is. A file the renderer could not open has nothing to show. */}
              {pageText === undefined ? (
                <Notice tone="neutral" icon="scan-text" text="Seiten nicht gerendert." size="compact" surface="white" />
              ) : (
                <p className={styles.text}>{pageText}</p>
              )}
              {located?.candidate.quote && (
                <div className={styles.hit}>
                  <span className={styles.hitLabel}>Fundstelle</span>
                  <span>{located.candidate.quote}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
