import type { Rect } from "@/domain/model";

/**
 * Renders a document into page images and page text, and locates a quote on a page.
 *
 * MuPDF compiled to WebAssembly: no native module, so it runs the same on a Windows
 * machine and in the Alpine image. One page at a time, which is also how the pages
 * go to the model later -- a page is the unit of provenance in the data model.
 *
 * PDF pages are measured in points at 72 dpi. Rendering at 2x gives roughly 150 dpi,
 * which reads well and stays within what a vision model takes without downscaling;
 * the long edge is capped so a poster-sized scan or a phone photo is not sent at full size.
 *
 * Page text and character positions come from one walk, so the string a run hands the
 * model is exactly the string a quote is later found in. Nothing else can drift between
 * "what the model read" and "what the marker points at".
 */

export interface RenderedPage {
  /** 1-based, as people and the UI count pages. */
  number: number;
  width: number;
  height: number;
  png: Uint8Array;
  /** The text layer, empty for a pure scan. Tells whether the page needs the vision model at all. */
  text: string;
}

export interface RenderOptions {
  /** Pixels on the longer edge. */
  maxEdge?: number;
  /** Render scale before the edge cap applies. 2 = about 150 dpi for a PDF page. */
  scale?: number;
}

const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_SCALE = 2;
const PERCENT = 100;

/** Formats MuPDF opens by mime type. Anything else is handed over as a PDF. */
const RENDERABLE = new Set(["application/pdf", "image/jpeg", "image/png"]);

export const canRender = (contentType: string) => RENDERABLE.has(contentType);

/* ---------- One walk: the page's text and where each character sits ---------- */

type Quad = [number, number, number, number, number, number, number, number];

interface PageContent {
  text: string;
  /** Box per code unit of `text`; null for the newlines the walk inserts between lines. */
  quads: (Quad | null)[];
  bounds: { x: number; y: number; width: number; height: number };
}

// Minimal shape of the MuPDF page, so this module does not depend on the import's types.
interface MupdfPage {
  getBounds(): [number, number, number, number];
  toStructuredText(options?: string): { walk(walker: { onChar?: (c: string, o: unknown, f: unknown, s: number, q: Quad) => void; endLine?: () => void }): void; destroy(): void };
}

const readPage = (page: MupdfPage): PageContent => {
  const [x0, y0, x1, y1] = page.getBounds();
  const structured = page.toStructuredText("preserve-whitespace");
  let text = "";
  const quads: (Quad | null)[] = [];
  try {
    structured.walk({
      onChar(character, _origin, _font, _size, quad) {
        text += character;
        // A character outside the basic plane is two code units; both point at the same box.
        for (let unit = 0; unit < character.length; unit += 1) quads.push(quad);
      },
      endLine() {
        text += "\n";
        quads.push(null);
      },
    });
  } finally {
    structured.destroy();
  }
  return { text: text.trim() === "" ? "" : text, quads, bounds: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
};

/* ---------- Normalising, so a quote survives the trip through the model ---------- */

const DASHES = /[‐‑‒–—−]/;
const QUOTES = /[‘’‚‛′]/;
const DOUBLE_QUOTES = /[“”„‟«»]/;
const SOFT_HYPHEN = "­";

const fold = (character: string): string => {
  if (DASHES.test(character)) return "-";
  if (QUOTES.test(character)) return "'";
  if (DOUBLE_QUOTES.test(character)) return '"';
  return character.toLowerCase();
};

interface Normalized {
  text: string;
  /** Index in the source string for every character of `text`. */
  source: number[];
}

/**
 * Collapses what a model reliably changes and a layout reliably inserts: runs of
 * whitespace, line breaks, a word split across two lines by a hyphen, and the various
 * dashes and quotation marks. Case is folded because a model often re-capitalises.
 */
const normalize = (raw: string): Normalized => {
  let text = "";
  const source: number[] = [];
  let pendingSpace = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index] ?? "";
    if (character === SOFT_HYPHEN) continue;
    // A hyphen before a line break splits one word; both go away.
    if (character === "-" && raw[index + 1] === "\n") {
      index += 1;
      continue;
    }
    if (/\s/.test(character)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && text !== "") {
      text += " ";
      source.push(index);
    }
    pendingSpace = false;
    text += fold(character);
    source.push(index);
  }
  return { text, source };
};

/* ---------- Locating ---------- */

export interface Located {
  /** The region to mark, in percent of the page, as the UI draws it. */
  rect: Rect;
  /** How often the quote occurs on the page. More than one means it does not pin a place. */
  hits: number;
}

const unionRect = (content: PageContent, from: number, to: number): Rect | undefined => {
  const found = content.quads.slice(from, to + 1).filter((quad): quad is Quad => quad !== null);
  if (found.length === 0) return undefined;

  const xs = found.flatMap((q) => [q[0], q[2], q[4], q[6]]);
  const ys = found.flatMap((q) => [q[1], q[3], q[5], q[7]]);
  const { bounds } = content;
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: ((left - bounds.x) / bounds.width) * PERCENT,
    y: ((top - bounds.y) / bounds.height) * PERCENT,
    w: ((Math.max(...xs) - left) / bounds.width) * PERCENT,
    h: ((Math.max(...ys) - top) / bounds.height) * PERCENT,
  };
};

const locateIn = (content: PageContent, quote: string): Located | undefined => {
  const haystack = normalize(content.text);
  const needle = normalize(quote).text;
  if (needle === "" || haystack.text === "") return undefined;

  const starts: number[] = [];
  for (let at = haystack.text.indexOf(needle); at !== -1; at = haystack.text.indexOf(needle, at + 1)) starts.push(at);
  if (starts.length === 0) return undefined;

  const first = starts[0] ?? 0;
  const from = haystack.source[first] ?? 0;
  const to = haystack.source[first + needle.length - 1] ?? from;
  const rect = unionRect(content, from, to);
  return rect === undefined ? undefined : { rect, hits: starts.length };
};

export interface QuoteRequest {
  /** 1-based page number the candidate names. */
  page: number;
  quote: string;
}

/**
 * Finds each quote on the page it claims to come from.
 *
 * Returns one entry per request, undefined where the quote is not on that page -- which
 * is worth acting on: a value whose quote is nowhere in the document it cites was not
 * read off the page, whatever the model said.
 */
export const locateQuotes = async (
  bytes: Uint8Array,
  contentType: string,
  requests: readonly QuoteRequest[],
): Promise<(Located | undefined)[]> => {
  if (requests.length === 0) return [];
  const mupdf = await import("mupdf");
  const document = mupdf.Document.openDocument(bytes, contentType);
  const results: (Located | undefined)[] = new Array<Located | undefined>(requests.length).fill(undefined);
  const wanted = [...new Set(requests.map((request) => request.page))].sort((a, b) => a - b);

  try {
    for (const number of wanted) {
      if (number < 1 || number > document.countPages()) continue;
      const page = document.loadPage(number - 1);
      try {
        const content = readPage(page as unknown as MupdfPage);
        requests.forEach((request, index) => {
          if (request.page === number) results[index] = locateIn(content, request.quote);
        });
      } finally {
        page.destroy();
      }
    }
  } finally {
    document.destroy();
  }
  return results;
};

/* ---------- Rendering ---------- */

/**
 * Renders every page of `bytes`. `contentType` decides the parser; a JPEG or PNG is a
 * one-page document. The whole document is decoded once and pages are produced one by
 * one, so a long scan never holds all its images in memory at the same time.
 */
export async function* renderPages(bytes: Uint8Array, contentType: string, options: RenderOptions = {}): AsyncGenerator<RenderedPage> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const baseScale = options.scale ?? DEFAULT_SCALE;
  // Loaded on demand: the WebAssembly module is several megabytes and only page rendering needs it.
  const mupdf = await import("mupdf");
  const document = mupdf.Document.openDocument(bytes, contentType);
  try {
    const count = document.countPages();
    for (let index = 0; index < count; index += 1) {
      const page = document.loadPage(index);
      try {
        const content = readPage(page as unknown as MupdfPage);
        const longEdge = Math.max(content.bounds.width, content.bounds.height) * baseScale;
        const scale = longEdge > maxEdge ? baseScale * (maxEdge / longEdge) : baseScale;
        const pixmap = page.toPixmap([scale, 0, 0, scale, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
        try {
          yield { number: index + 1, width: pixmap.getWidth(), height: pixmap.getHeight(), png: pixmap.asPNG(), text: content.text };
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    }
  } finally {
    document.destroy();
  }
}
