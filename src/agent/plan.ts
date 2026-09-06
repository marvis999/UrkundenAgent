import path from "node:path";
import { documentsDirectory, int, query, queryOne, text, textOrNull, type Row } from "@/db/connect";
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
  /** Absolute path to the rendered PNG, ready to hand to the model as an image part. */
  readonly imagePath: string;
  readonly width: number;
  readonly height: number;
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
  readonly caseId: string;
  /** The run this plan belongs to. An unfinished run is resumed rather than duplicated. */
  readonly number: number;
  readonly documents: readonly PlannedDocument[];
  readonly skipped: readonly SkippedDocument[];
  readonly pageCount: number;
}

/**
 * The number of the run to start. An unfinished run is resumed, so a crash halfway
 * through does not leave a case with two runs that both claim the same documents.
 */
const runNumber = async (caseId: string): Promise<number> => {
  const row = await queryOne(
    `SELECT c.current_run, r.finished_at FROM case_file c
     LEFT JOIN run r ON r.case_id = c.id AND r.number = c.current_run
     WHERE c.id = $1`,
    caseId,
  );
  if (row === undefined) return 0;
  const current = int(row.current_run);
  // current_run 0 means nothing has ever run; the first run is number 1.
  return current > 0 && row.finished_at === null ? current : current + 1;
};

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

const toPage = (row: Row): PlannedPage => ({
  number: int(row.number),
  imagePath: path.join(documentsDirectory(), text(row.image_path)),
  width: int(row.width),
  height: int(row.height),
  text: text(row.text),
});

export const planRun = async (caseId: string): Promise<RunPlan> => {
  const [number, documentRows, pageRows] = await Promise.all([
    runNumber(caseId),
    query(UNREAD_DOCUMENTS, caseId),
    query(
      `SELECT p.document_id, p.number, p.image_path, p.width, p.height, p.text
       FROM page p JOIN document d ON d.id = p.document_id
       WHERE d.case_id = $1 ORDER BY p.document_id, p.number`,
      caseId,
    ),
  ]);

  const pagesByDocument = new Map<string, PlannedPage[]>();
  for (const row of pageRows) {
    const documentId = text(row.document_id);
    const pages = pagesByDocument.get(documentId) ?? [];
    pages.push(toPage(row));
    pagesByDocument.set(documentId, pages);
  }

  const documents: PlannedDocument[] = [];
  const skipped: SkippedDocument[] = [];
  for (const row of documentRows) {
    const id = text(row.id);
    const fileName = text(row.file_name);
    const pages = pagesByDocument.get(id);
    if (pages === undefined || pages.length === 0) {
      skipped.push({ fileName, reason: "noch keine Seiten gerendert" });
      continue;
    }
    documents.push({ id, fileName, kind: textOrNull(row.kind) as DocumentKind, pages });
  }

  return {
    caseId,
    number,
    documents,
    skipped,
    pageCount: documents.reduce((sum, document) => sum + document.pages.length, 0),
  };
};
