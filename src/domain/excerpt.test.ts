import assert from "node:assert/strict";
import test from "node:test";
import { excerptView } from "./excerpt";
import type { Rect } from "./model";

/**
 * The excerpt geometry.
 *
 * One property carries most of the value: the marked region has to be inside what the
 * frame shows. A marker half outside the frame still looks like a picture of a document,
 * so this is exactly the kind of wrong that ships.
 */

const A4 = 1.41;
const LANDSCAPE_SCAN = 0.71;

/** The view box in the same percent-of-page terms the component lays out in. */
const box = (crop: Rect, aspect: number) => {
  const view = excerptView(crop, aspect);
  const width = 100 / view.zoom;
  return { x: view.x, y: view.y, width, height: (width * view.ratio) / aspect, zoom: view.zoom, ratio: view.ratio };
};

/** Compared against the region cut back to the sheet, which is all there is to show. */
const contains = (crop: Rect, aspect: number) => {
  const view = box(crop, aspect);
  const right = Math.min(crop.x + crop.w, 100);
  const bottom = Math.min(crop.y + crop.h, 100);
  const insideX = view.x <= crop.x + 1e-6 && right <= view.x + view.width + 1e-6;
  const insideY = view.y <= crop.y + 1e-6 && bottom <= view.y + view.height + 1e-6;
  return { insideX, insideY, view };
};

/* The shapes the model actually returns, taken from a run over the sample documents. */
const REAL_CROPS: readonly Rect[] = [
  { x: 6.7, y: 30.8, w: 35.9, h: 2.0 },
  { x: 10.4, y: 63.8, w: 54.5, h: 1.6 },
  { x: 7.1, y: 13.1, w: 16.3, h: 1.6 },
  { x: 44.0, y: 12.0, w: 12.0, h: 56.5 },
  { x: 28.5, y: 30.0, w: 4.6, h: 42.1 },
  { x: 61.5, y: 5.0, w: 5.0, h: 2.5 },
  { x: 73.5, y: 88.0, w: 4.2, h: 12.2 },
];

test("the marked region always lies inside the excerpt, on both page shapes", () => {
  for (const aspect of [A4, LANDSCAPE_SCAN]) {
    for (const crop of REAL_CROPS) {
      const { insideX, insideY, view } = contains(crop, aspect);
      assert.ok(insideX, `x: ${JSON.stringify(crop)} outside ${JSON.stringify(view)} at aspect ${aspect}`);
      assert.ok(insideY, `y: ${JSON.stringify(crop)} outside ${JSON.stringify(view)} at aspect ${aspect}`);
    }
  }
});

test("the excerpt never shows anything beyond the page", () => {
  for (const crop of REAL_CROPS) {
    const view = box(crop, A4);
    assert.ok(view.x >= 0 && view.x + view.width <= 100 + 1e-6, `x out of page: ${JSON.stringify(view)}`);
    assert.ok(view.y >= 0 && view.y + view.height <= 100 + 1e-6, `y out of page: ${JSON.stringify(view)}`);
  }
});

test("a region in the corner is pulled back onto the page rather than centred off it", () => {
  const corner = box({ x: 0, y: 0, w: 4, h: 2 }, A4);
  assert.equal(corner.x, 0);
  assert.equal(corner.y, 0);

  const far = box({ x: 96, y: 97, w: 4, h: 3 }, A4);
  assert.ok(far.x + far.width <= 100 + 1e-6);
  assert.ok(far.y + far.height <= 100 + 1e-6);
});

test("a small region is magnified, but only so far", () => {
  const tiny = box({ x: 50, y: 50, w: 0.5, h: 0.4 }, A4);
  assert.ok(tiny.zoom > 1, "a small region should be magnified");
  assert.ok(tiny.zoom <= 100 / 24 + 1e-6, `magnification is capped, got ${tiny.zoom}`);
});

test("a region as wide as the page is not magnified at all", () => {
  const wide = box({ x: 0, y: 40, w: 100, h: 3 }, A4);
  assert.equal(wide.zoom, 1);
});

test("the frame takes the shape of the region, within bounds", () => {
  const strip = box({ x: 5, y: 40, w: 60, h: 1.5 }, A4);
  const column = box({ x: 44, y: 12, w: 12, h: 56.5 }, A4);
  assert.ok(strip.ratio < column.ratio, "a wide strip gets a flatter frame than a tall column");
  assert.ok(strip.ratio >= 0.34 - 1e-9 && column.ratio <= 0.8 + 1e-9, "both stay within the allowed shapes");
});
