import assert from "node:assert/strict";
import test from "node:test";
import { fractionsOf, turnRect } from "./pages";

/**
 * The one piece of the renderer that is arithmetic rather than MuPDF: where a marked
 * region lands once the page has been turned upright. The direction was checked against
 * MuPDF itself -- rotate(90) carries the top edge of a page to its right edge.
 */
test("a quarter turn carries a word from the top left of a portrait page to its top right, standing on end", () => {
  const bounds = { x: 0, y: 0, width: 595, height: 842 };
  const word: [number, number][] = [
    [40, 40],
    [200, 40],
    [40, 80],
    [200, 80],
  ];

  const upright = fractionsOf(word, bounds, 0);
  assert.ok(upright.x < 10 && upright.y < 10 && upright.w > upright.h);

  const quarter = fractionsOf(word, bounds, 90);
  assert.ok(quarter.x > 85 && quarter.y < 10, JSON.stringify(quarter));
  assert.ok(quarter.h > quarter.w);

  const half = fractionsOf(word, bounds, 180);
  assert.ok(half.x > 60 && half.y > 85, JSON.stringify(half));
});

test("a stored marker turns with its page, and four quarter turns bring it back", () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.05 };
  const quarter = turnRect(rect, 90);
  assert.ok(near(quarter.x, 0.75) && near(quarter.y, 0.1) && near(quarter.w, 0.05) && near(quarter.h, 0.3), JSON.stringify(quarter));
  const half = turnRect(rect, 180);
  assert.ok(near(half.x, 0.6) && near(half.y, 0.75), JSON.stringify(half));
  const around = [90, 90, 90, 90].reduce((r, turn) => turnRect(r, turn), rect);
  assert.ok(near(around.x, rect.x) && near(around.y, rect.y) && near(around.w, rect.w) && near(around.h, rect.h));
});
