import path from "node:path";
import { documentsDirectory, int, query, text, textOrNull, type Row } from "@/db/connect";
import { nextRunNumber } from "@/db/runWriter";
import type { DocumentKind } from "@/domain/status";

/**
 * What a run is about to read.
 *
 * The plan is assembled before the first model call, so a run knows its own size up
 * front: that is what the progress strip counts down and what the run log reports
 * against. Nothing here calls a model and nothing here writes.
 *
 * A document only enters a run once it has rendered pages. Rendering happens elsewhere
 * (see `page` in the schema); until it has run, the document is described but unreadable,
 * and a run that pretended otherwise would produce values with no page to point at.
 */

export interface PlannedPage {
  readonly number: number;
  /**
   * Absolute path to the rendered PNG, null for a page that was never a picture: a note
   * or an e-mail is text and nothing else.
   */
  readonly imagePath: string | null;
  readonly width: number;
  readonly height: number;
  /** Degrees clockwise the stored image has already been turned upright. */
  readonly rotation: number;
  /**
   * The text layer, empty for a scan or a photo. Empty is the signal to send the image
   * instead: it is the difference between reading a page and looking at one.
   */
  readonly text: string;
}

export interface PlannedDocument {
  /** Store id, scoped by case. */
  readonly id: string;
  readonly fileName: string;
  readonly kind: DocumentKind;
  readonly pages: readonly PlannedPage[];
}

export interface SkippedDocument {
  readonly fileName: string;
  readonly reason: string;
}

export interface RunPlan {
  /** The run this plan belongs to. An unfinished run is resumed rather than duplicated. */
  readonly number: number;
  readonly documents: readonly PlannedDocument[];
  readonly skipped: readonly SkippedDocument[];
  readonly pageCount: number;
}

/**
 * Documents this run has to read: those with rendered pages that no finished run has
 * read yet. Stated that way rather than by arrival date, the set is idempotent -- a run
 * that failed and is started again reads exactly the same documents, and a run that
 * succeeded reads none of them a second time.
 */
const UNREAD_DOCUMENTS = `
  SELECT d.id, d.file_name, d.kind
  FROM document d
  WHERE d.case_id = $1
    AND NOT EXISTS (
      SELECT 1 FROM run_document rd
      JOIN run r ON r.id = rd.run_id
      WHERE rd.document_id = d.id AND r.finished_at IS NOT NULL
    )
  ORDER BY d.sort_order`;

const toPage = (row: Row): PlannedPage => {
  const imagePath = textOrNull(row.image_path);
  return {
    number: int(row.number),
    imagePath: imagePath === null ? null : path.join(documentsDirectory(), imagePath),
    width: int(row.width),
    height: int(row.height),
    rotation: int(row.rotation),
    text: text(row.text),
  };
};

/**
 * A page a run can do something with: it has text to read, or an image to look at.
 * One with neither would reach the model as nothing and come back as nothing.
 */
const isReadable = (page: PlannedPage) => page.text.trim() !== "" || page.imagePath !== null;

export const planRun = async (caseId: string): Promise<RunPlan> => {
  const [number, documentRows, pageRows] = await Promise.all([
    nextRunNumber(caseId),
    query(UNREAD_DOCUMENTS, caseId),
    query(
      `SELECT p.document_id, p.number, p.image_path, p.width, p.height, p.rotation, p.text
       FROM page p JOIN document d ON d.id = p.document_id
       WHERE d.case_id = $1 ORDER BY p.document_id, p.number`,
      caseId,
    ),
  ]);

  const pagesByDocument = Map.groupBy(pageRows, (row) => text(row.document_id));

  const documents: PlannedDocument[] = [];
  const skipped: SkippedDocument[] = [];
  for (const row of documentRows) {
    const id = text(row.id);
    const fileName = text(row.file_name);
    const pages = pagesByDocument.get(id)?.map(toPage).filter(isReadable);
    if (pages === undefined || pages.length === 0) {
      skipped.push({ fileName, reason: "keine lesbaren Seiten" });
      continue;
    }
    documents.push({ id, fileName, kind: textOrNull(row.kind) as DocumentKind, pages });
  }

  return { number, documents, skipped, pageCount: documents.reduce((sum, document) => sum + document.pages.length, 0) };
};
