import type { Rect } from "./model";

/**
 * Which part of a page an excerpt shows.
 *
 * Pure geometry, kept out of the component because it is the part that can be wrong in a
 * way nobody notices: a marked region half outside the frame still looks like a picture
 * of a document. The invariant is simple and worth stating -- the marked region is always
 * inside the view, and the view is always inside the page.
 *
 * Everything is worked in the page's own proportions rather than in percentages of each
 * axis, because 10% of the width and 10% of the height are the same number and different
 * distances, and a rectangle compared across the two comes out skewed.
 */

/** How much of the frame the marked region should take up. */
const TARGET_FILL = 0.58;

/**
 * The least of the page an excerpt shows, and so the most it may magnify. A marked date
 * is a couple of percent of a page wide; blown up to fill the frame it is unreadable
 * pixels with nothing around it to say where on the sheet it sits.
 */
const MIN_VIEW_WIDTH = 24;

/**
 * The shape the frame may take, height over width.
 *
 * Not one fixed shape, because the marked regions are not one shape: an amount is a short
 * wide strip, a column of a Grundbuch page is narrow and half the sheet tall. Forced into
 * a letterbox the second shrinks until it is unreadable, so the frame follows the region
 * and is only stopped from becoming absurd.
 */
const MIN_RATIO = 0.34;
const MAX_RATIO = 0.8;

const FULL = 100;

export interface ExcerptView {
  /** How much wider than the frame the whole page is drawn. */
  zoom: number;
  /** Left edge of the view, in percent of the page width. */
  x: number;
  /** Top edge of the view, in percent of the page height. */
  y: number;
  /** Shape the frame takes for this region, height over width. */
  ratio: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * @param crop   the marked region, in percent of the page
 * @param aspect the page's height divided by its width
 */
/**
 * The region, cut back to the sheet.
 *
 * A model asked for a rectangle sometimes returns one that runs off the page -- a column
 * "to the bottom" comes back as y 88 plus height 12.2. There is no paper there, so the
 * part beyond the edge is not evidence of anything, and a view box asked to contain it
 * could not also stay on the page.
 */
const onPage = (crop: Rect): Rect => {
  const x = clamp(crop.x, 0, FULL);
  const y = clamp(crop.y, 0, FULL);
  return { x, y, w: clamp(crop.w, 0, FULL - x), h: clamp(crop.h, 0, FULL - y) };
};

export const excerptView = (raw: Rect, aspect: number): ExcerptView => {
  const crop = onPage(raw);
  const pageHeight = FULL * aspect;
  const markedWidth = Math.max(crop.w, Number.EPSILON);
  const markedHeight = Math.max(crop.h * aspect, Number.EPSILON);
  const centreX = crop.x + crop.w / 2;
  const centreY = (crop.y + crop.h / 2) * aspect;

  const ratio = clamp(markedHeight / markedWidth, MIN_RATIO, MAX_RATIO);

  // Whichever axis needs more room decides the width; the other follows from the shape,
  // so the region is shown whole and never stretched.
  const byWidth = markedWidth / TARGET_FILL;
  const byHeight = markedHeight / TARGET_FILL / ratio;
  let width = clamp(Math.max(byWidth, byHeight, MIN_VIEW_WIDTH), 0, FULL);
  let height = width * ratio;
  if (height > pageHeight) {
    // Never show more paper than there is: a short page fills the frame and letterboxes.
    height = pageHeight;
    width = Math.min(FULL, height / ratio);
  }

  return {
    zoom: FULL / width,
    ratio,
    x: clamp(centreX - width / 2, 0, Math.max(0, FULL - width)),
    // Back to percent of the page height, which is what a translate on the layer means.
    y: clamp(centreY - height / 2, 0, Math.max(0, pageHeight - height)) / aspect,
  };
};
