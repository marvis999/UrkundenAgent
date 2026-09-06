import type { PromptPart } from "@/agent/llm";
import type { PlannedDocument, PlannedPage } from "@/agent/plan";

/**
 * Pages as prompt parts.
 *
 * One rule decides the form: a page with a text layer travels as text, a page without
 * one travels as an image. That is not an optimisation, it is the difference between
 * reading a page and looking at one -- a text page yields a verbatim quote that the
 * merge can verify against the stored text, an image page yields a rectangle instead.
 *
 * Every part is labelled with its page number, because a candidate without a page has
 * no Fundstelle and gets discarded.
 */

/** Rendered pages are always PNG; see the page renderer. */
const PAGE_MEDIA_TYPE = "image/png" as const;

/**
 * A page's text layer is a whole page of a deed at most. Truncating protects a run from
 * a pathological render rather than from ordinary documents, so the limit is generous
 * and the cut is announced: silently dropping half a page would silently drop values.
 */
const MAX_TEXT_CHARS = 20_000;

const clip = (text: string) =>
  text.length <= MAX_TEXT_CHARS ? text : `${text.slice(0, MAX_TEXT_CHARS)}\n[... Seitentext hier abgeschnitten ...]`;

export const hasText = (page: PlannedPage) => page.text.trim() !== "";

/**
 * Text wins wherever there is any: a note has only text, and a PDF page with a text layer
 * yields a quote the merge can verify, which an image never does. `planRun` drops pages
 * with neither, so the image branch always has a path.
 */
export const pagePart = (page: PlannedPage): PromptPart =>
  hasText(page) || page.imagePath === null
    ? { kind: "text", text: `--- Seite ${page.number} (Textebene) ---\n${clip(page.text)}` }
    : {
        kind: "image",
        path: page.imagePath,
        mediaType: PAGE_MEDIA_TYPE,
        caption: `--- Seite ${page.number} (Bild, ${page.width}x${page.height} px) ---`,
      };

/**
 * Header that names the file and lists its pages by their position in this request. The
 * position is how the model addresses a page; the printed page number is only a label.
 */
export const documentHeader = (document: PlannedDocument, pages: readonly PlannedPage[]): PromptPart => ({
  kind: "text",
  text: [
    `Datei: ${document.fileName}`,
    "Seiten in dieser Anfrage, in dieser Reihenfolge:",
    ...pages.map((page, index) => `  pageRef ${index + 1} = Seite ${page.number} (${hasText(page) ? "Text" : "Bild"})`),
  ].join("\n"),
});
