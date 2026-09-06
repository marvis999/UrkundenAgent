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
 *
 * A page that lies on its side is rendered again, turned upright, before anything reads
 * values off it (`renderTurned`); the quote geometry applies the same turn, so a marker
 * lands on the picture the viewer shows.
 */

type MupdfModule = typeof import("mupdf");
type MupdfPageObject = ReturnType<InstanceType<MupdfModule["Document"]>["loadPage"]>;

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

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageContent {
  text: string;
  /** Box per code unit of `text`; null for the newlines the walk inserts between lines. */
  quads: (Quad | null)[];
  bounds: Bounds;
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

/* ---------- Turning a page upright ---------- */

/**
 * A point of the page under the turn the renderer applies. MuPDF's rotation matrix is
 * [cos sin -sin cos], which in the page's y-down space turns clockwise: the top edge of
 * a page turned by 90 becomes its right edge. Rounded, so a quarter turn is exact.
 */
export const turned = (x: number, y: number, rotation: number): [number, number] => {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians));
  const sin = Math.round(Math.sin(radians));
  return [x * cos - y * sin, x * sin + y * cos];
};

const extent = (points: readonly [number, number][]) => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
};

/**
 * The share of the turned page that a set of points covers, in percent, as the UI draws
 * a marker. The sheet is turned the same way the pixmap was, so the fractions refer to the
 * image that is actually on disk.
 */
export const fractionsOf = (points: readonly [number, number][], bounds: Bounds, rotation: number): Rect => {
  const corners: [number, number][] = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ];
  const sheet = extent(corners.map(([x, y]) => turned(x, y, rotation)));
  const marks = extent(points.map(([x, y]) => turned(x, y, rotation)));
  return {
    x: ((marks.left - sheet.left) / sheet.width) * PERCENT,
    y: ((marks.top - sheet.top) / sheet.height) * PERCENT,
    w: (marks.width / sheet.width) * PERCENT,
    h: (marks.height / sheet.height) * PERCENT,
  };
};

/** A rectangle in fractions of a page, after the page turned `rotation` degrees clockwise. */
export const turnRect = (rect: Rect, rotation: number): Rect => {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: 1 - rect.y - rect.h, y: rect.x, w: rect.h, h: rect.w };
    case 180:
      return { x: 1 - rect.x - rect.w, y: 1 - rect.y - rect.h, w: rect.w, h: rect.h };
    case 270:
      return { x: rect.y, y: 1 - rect.x - rect.w, w: rect.h, h: rect.w };
    default:
      return rect;
  }
};

/* ---------- Which way the text runs ---------- */

export type TextDirection = "rows" | "columns" | "unknown";

/** Long edge of the picture the profiles are taken from; enough to keep lines of text apart. */
const PROFILE_EDGE = 800;
/** Share of each edge left out, so margins and binding shadows do not count as structure. */
const PROFILE_MARGIN = 0.15;
/** Fewer crossings than this is not a page of text. */
const MIN_CROSSINGS = 12;
/** One direction has to beat the other by this much before the picture is believed. */
const CLEAR_LEAD = 2;
const INK = 128;
const SMOOTHING = 1;

/** Times a profile, lightly smoothed, crosses its own mean: two per line of text, few per column of it. */
const crossings = (profile: Float64Array, from: number, to: number): number => {
  const smooth = (i: number) => {
    let sum = 0;
    for (let k = i - SMOOTHING; k <= i + SMOOTHING; k += 1) sum += profile[Math.min(to - 1, Math.max(from, k))] ?? 0;
    return sum / (2 * SMOOTHING + 1);
  };
  let total = 0;
  for (let i = from; i < to; i += 1) total += profile[i] ?? 0;
  const mean = total / (to - from);
  let count = 0;
  let above: boolean | undefined;
  for (let i = from; i < to; i += 1) {
    const now = smooth(i) > mean;
    if (above !== undefined && now !== above) count += 1;
    above = now;
  }
  return count;
};

/** Coefficient of variation of a profile: how unevenly the ink is spread along it. */
const spread = (profile: Float64Array, from: number, to: number): number => {
  let total = 0;
  for (let i = from; i < to; i += 1) total += profile[i] ?? 0;
  const mean = total / (to - from);
  if (mean === 0) return 0;
  let squares = 0;
  for (let i = from; i < to; i += 1) squares += ((profile[i] ?? 0) - mean) ** 2;
  return Math.sqrt(squares / (to - from)) / mean;
};

/**
 * Whether the text on a page image runs in rows or in columns, from the picture alone.
 *
 * Ink on a page of text comes in lines: a profile of dark pixels per row crosses its
 * mean twice per line, a profile per column hardly at all. On a page lying on its side
 * the two swap. Counting the crossings needs neither a model nor OCR, and it answers
 * exactly the question a wrong quarter turn gets wrong. It cannot tell upright from
 * upside down, and it says "unknown" for a picture that is not a page of text.
 */
export const textDirection = async (png: Uint8Array): Promise<TextDirection> => {
  const mupdf = await import("mupdf");
  const document = mupdf.Document.openDocument(png, "image/png");
  try {
    const page = document.loadPage(0);
    try {
      const [x0, y0, x1, y1] = page.getBounds();
      const scale = PROFILE_EDGE / Math.max(x1 - x0, y1 - y0);
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceGray, false, true);
      try {
        const width = pixmap.getWidth();
        const height = pixmap.getHeight();
        const stride = pixmap.getStride();
        const pixels = pixmap.getPixels();
        const rows = new Float64Array(height);
        const columns = new Float64Array(width);
        const left = Math.floor(width * PROFILE_MARGIN);
        const right = Math.ceil(width * (1 - PROFILE_MARGIN));
        const top = Math.floor(height * PROFILE_MARGIN);
        const bottom = Math.ceil(height * (1 - PROFILE_MARGIN));
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            if ((pixels[y * stride + x] ?? 255) < INK) {
              rows[y] = (rows[y] ?? 0) + 1;
              columns[x] = (columns[x] ?? 0) + 1;
            }
          }
        }
        const byRow = crossings(rows, top, bottom);
        const byColumn = crossings(columns, left, right);
        const rowSpread = spread(rows, top, bottom);
        const columnSpread = spread(columns, left, right);
        if (byRow >= MIN_CROSSINGS && byRow > CLEAR_LEAD * byColumn) return "rows";
        if (byColumn >= MIN_CROSSINGS && byColumn > CLEAR_LEAD * byRow) return "columns";
        return "unknown";
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    document.destroy();
  }
};

/* ---------- Locating ---------- */

export interface Located {
  /** The region to mark, in percent of the page, as the UI draws it. */
  rect: Rect;
  /** How often the quote occurs on the page. More than one means it does not pin a place. */
  hits: number;
}

const unionRect = (content: PageContent, from: number, to: number, rotation: number): Rect | undefined => {
  const found = content.quads.slice(from, to + 1).filter((quad): quad is Quad => quad !== null);
  if (found.length === 0) return undefined;
  const points = found.flatMap((q): [number, number][] => [
    [q[0], q[1]],
    [q[2], q[3]],
    [q[4], q[5]],
    [q[6], q[7]],
  ]);
  return fractionsOf(points, content.bounds, rotation);
};

const locateIn = (content: PageContent, quote: string, rotation: number): Located | undefined => {
  const haystack = normalize(content.text);
  const needle = normalize(quote).text;
  if (needle === "" || haystack.text === "") return undefined;

  const starts: number[] = [];
  for (let at = haystack.text.indexOf(needle); at !== -1; at = haystack.text.indexOf(needle, at + 1)) starts.push(at);
  if (starts.length === 0) return undefined;

  const first = starts[0] ?? 0;
  const from = haystack.source[first] ?? 0;
  const to = haystack.source[first + needle.length - 1] ?? from;
  const rect = unionRect(content, from, to, rotation);
  return rect === undefined ? undefined : { rect, hits: starts.length };
};

export interface QuoteRequest {
  /** 1-based page number the candidate names. */
  page: number;
  quote: string;
  /** Degrees clockwise the stored page image was turned; the marker follows. */
  rotation: number;
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
          if (request.page === number) results[index] = locateIn(content, request.quote, request.rotation);
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

const renderOne = (mupdf: MupdfModule, page: MupdfPageObject, number: number, rotation: number, options: RenderOptions): RenderedPage => {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const baseScale = options.scale ?? DEFAULT_SCALE;
  const content = readPage(page as unknown as MupdfPage);
  const longEdge = Math.max(content.bounds.width, content.bounds.height) * baseScale;
  const scale = longEdge > maxEdge ? baseScale * (maxEdge / longEdge) : baseScale;
  // The turn comes after the scale; the pixmap covers the turned bounds by itself.
  const matrix = mupdf.Matrix.concat(mupdf.Matrix.scale(scale, scale), mupdf.Matrix.rotate(rotation));
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  try {
    return { number, width: pixmap.getWidth(), height: pixmap.getHeight(), png: pixmap.asPNG(), text: content.text };
  } finally {
    pixmap.destroy();
  }
};

/**
 * Renders every page of `bytes`. `contentType` decides the parser; a JPEG or PNG is a
 * one-page document. The whole document is decoded once and pages are produced one by
 * one, so a long scan never holds all its images in memory at the same time.
 */
export async function* renderPages(bytes: Uint8Array, contentType: string, options: RenderOptions = {}): AsyncGenerator<RenderedPage> {
  // Loaded on demand: the WebAssembly module is several megabytes and only page rendering needs it.
  const mupdf = await import("mupdf");
  const document = mupdf.Document.openDocument(bytes, contentType);
  try {
    const count = document.countPages();
    for (let index = 0; index < count; index += 1) {
      const page = document.loadPage(index);
      try {
        yield renderOne(mupdf, page, index + 1, 0, options);
      } finally {
        page.destroy();
      }
    }
  } finally {
    document.destroy();
  }
}

/** One page again, turned by `rotation` degrees clockwise: a scan that lay on its side. */
export const renderTurned = async (bytes: Uint8Array, contentType: string, number: number, rotation: number): Promise<RenderedPage> => {
  const mupdf = await import("mupdf");
  const document = mupdf.Document.openDocument(bytes, contentType);
  try {
    const page = document.loadPage(number - 1);
    try {
      return renderOne(mupdf, page, number, rotation, {});
    } finally {
      page.destroy();
    }
  } finally {
    document.destroy();
  }
};
