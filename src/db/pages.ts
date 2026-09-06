import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileType } from "@/lib/documents";
import { canRender, locateQuotes, renderPages } from "@/lib/pages";
import { documentsDirectory, int, query, queryOne, text, textOrNull, transaction } from "./connect";

/**
 * Rendered pages of a document: one image and one text per page.
 *
 * Images live next to the original in the data directory, under `<hash>.pages/`, so a
 * document's original and its pages travel together and are content-addressed the same
 * way. The database holds the paths and the text; the text is what a later run reads
 * before deciding whether a page needs the vision model at all.
 */

const PAGES_SUFFIX = ".pages";
const IMAGE_EXTENSION = ".png";

/** `<case>/<hash>.pages/<n>.png`, with forward slashes so the row works in the container. */
const pagePath = (storagePath: string, number: number) => {
  const original = path.posix.parse(storagePath);
  return path.posix.join(original.dir, `${original.name}${PAGES_SUFFIX}`, `${number}${IMAGE_EXTENSION}`);
};

const contentTypeOf = (fileName: string): string => fileType(fileName).contentType;

const findDocument = (caseId: string, documentKey: string) =>
  queryOne(
    "SELECT id, file_name, storage_path FROM document WHERE case_id = $1 AND (id = $2 OR id = $3)",
    caseId,
    documentKey,
    `${caseId}:${documentKey}`,
  );

export interface QuoteReport {
  /** Quotes that were found exactly once, and so carry a marked region. */
  quotesLocated: number;
  /**
   * On the page more than once, so the quote does not say which occurrence was read.
   * Marking the first would be a guess drawn as evidence -- the clerk would check a
   * different passage and find the same words there, which is exactly how a corrected
   * amount gets confirmed against the sentence it superseded.
   */
  quotesAmbiguous: number;
}

export interface RenderResult {
  documentId: string;
  pageCount: number;
}

const NO_QUOTES: QuoteReport = { quotesLocated: 0, quotesAmbiguous: 0 };

interface PageRow {
  number: number;
  /** Null for a text document: there is no picture of it to mark anything on. */
  imagePath: string | null;
  width: number;
  height: number;
  text: string;
}

/**
 * A text document as one page.
 *
 * Not split, because a page break is a claim about where something stops, and a pasted
 * note has none to make. One page keeps every quote checkable against the whole text and
 * keeps the Fundstelle honest: "die Notiz", not "Seite 3 der Notiz".
 */
const textPages = (bytes: Uint8Array): PageRow[] => [
  { number: 1, imagePath: null, width: 0, height: 0, text: new TextDecoder().decode(bytes) },
];

/**
 * Turns a stored document into page rows: images plus a text layer for a PDF or a photo,
 * one text page for a note or an e-mail. Rendering the same document again replaces its
 * pages, so a re-render after a library upgrade is one call.
 *
 * Returns undefined when the document has no file yet, or is of a kind that is neither.
 */
export const renderDocumentPages = async (caseId: string, documentKey: string): Promise<RenderResult | undefined> => {
  const row = await findDocument(caseId, documentKey);
  const storagePath = row === undefined ? null : textOrNull(row.storage_path);
  if (row === undefined || storagePath === null) return undefined;

  const type = fileType(text(row.file_name));
  if (type.form === "rendered" && !canRender(type.contentType)) return undefined;

  const documentId = text(row.id);
  const bytes = await readFile(path.join(documentsDirectory(), storagePath));

  // Pages are written to disk first; the rows follow in one transaction so a document
  // never has half its pages in the database.
  const rendered: PageRow[] = [];
  if (type.form === "text") {
    rendered.push(...textPages(bytes));
  } else {
    for await (const page of renderPages(bytes, type.contentType)) {
      const imagePath = pagePath(storagePath, page.number);
      const absolute = path.join(documentsDirectory(), imagePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, page.png);
      rendered.push({ number: page.number, imagePath, width: page.width, height: page.height, text: page.text });
    }
  }

  await transaction(async (client) => {
    await client.query("DELETE FROM page WHERE document_id = $1", [documentId]);
    for (const page of rendered) {
      await client.query(
        "INSERT INTO page (id, document_id, number, image_path, width, height, text) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [`${documentId}#${page.number}`, documentId, page.number, page.imagePath, page.width, page.height, page.text],
      );
    }
    await client.query("UPDATE document SET page_count = $1 WHERE id = $2", [rendered.length, documentId]);
  });

  return { documentId, pageCount: rendered.length };
};

const FRACTION = 100;

/**
 * Turns the quotes a run recorded into marked regions on the page.
 *
 * The model is never asked where something sits, only what it read. The quote is then
 * looked up in the same page text the model was given, which is what makes the marker
 * verifiable: a quote that is not on the page it names did not come off that page, so no
 * region is written and the value stands on its own.
 *
 * A quote that occurs several times on one page pins nothing, so it gets no region either.
 */
export const locateDocumentQuotes = async (caseId: string, documentKey: string): Promise<QuoteReport> => {
  const row = await findDocument(caseId, documentKey);
  const storagePath = row === undefined ? null : textOrNull(row.storage_path);
  if (row === undefined || storagePath === null) return NO_QUOTES;

  // A text document has no page image, so a quote from it has nowhere to be marked. Its
  // Fundstelle is the quote itself, which the merge already checked against the page.
  if (fileType(text(row.file_name)).form === "text") return NO_QUOTES;

  const documentId = text(row.id);
  const candidates = await query(
    `SELECT id, page, quote FROM candidate
     WHERE document_id = $1 AND quote IS NOT NULL AND page IS NOT NULL AND crop IS NULL`,
    documentId,
  );
  if (candidates.length === 0) return NO_QUOTES;

  const bytes = await readFile(path.join(documentsDirectory(), storagePath));
  const located = await locateQuotes(
    bytes,
    contentTypeOf(text(row.file_name)),
    candidates.map((candidate) => ({ page: int(candidate.page), quote: text(candidate.quote) })),
  );

  let quotesLocated = 0;
  let quotesAmbiguous = 0;
  for (const [index, candidate] of candidates.entries()) {
    const hit = located[index];
    if (hit === undefined) continue;
    if (hit.hits > 1) {
      quotesAmbiguous += 1;
      continue;
    }
    const { rect } = hit;
    await query("UPDATE candidate SET crop = $1 WHERE id = $2", JSON.stringify({
      x: rect.x / FRACTION,
      y: rect.y / FRACTION,
      w: rect.w / FRACTION,
      h: rect.h / FRACTION,
      caption: `Seite ${int(candidate.page)}`,
      hint: "",
      question: null,
    }), text(candidate.id));
    quotesLocated += 1;
  }
  return { quotesLocated, quotesAmbiguous };
};

export interface PageImage {
  absolutePath: string;
  size: number;
  contentType: string;
}

/** Locates one rendered page image, or undefined while the document has not been rendered. */
export const readPageImage = async (caseId: string, documentKey: string, number: number): Promise<PageImage | undefined> => {
  const row = await queryOne(
    `SELECT p.image_path FROM page p JOIN document d ON d.id = p.document_id
     WHERE d.case_id = $1 AND (d.id = $2 OR d.id = $3) AND p.number = $4`,
    caseId,
    documentKey,
    `${caseId}:${documentKey}`,
    number,
  );
  // A text page has no image; the viewer shows its text instead of asking for one.
  const imagePath = row === undefined ? null : textOrNull(row.image_path);
  if (imagePath === null) return undefined;
  const absolutePath = path.join(documentsDirectory(), imagePath);
  return { absolutePath, size: (await stat(absolutePath)).size, contentType: "image/png" };
};

export interface PageText {
  number: number;
  text: string;
}

/** The text layer of every rendered page, in order. Empty text marks a page that needs vision. */
export const documentPageTexts = async (caseId: string, documentKey: string): Promise<PageText[]> =>
  (
    await query(
      `SELECT p.number, p.text FROM page p JOIN document d ON d.id = p.document_id
       WHERE d.case_id = $1 AND (d.id = $2 OR d.id = $3) ORDER BY p.number`,
      caseId,
      documentKey,
      `${caseId}:${documentKey}`,
    )
  ).map((row) => ({ number: int(row.number), text: text(row.text) }));
