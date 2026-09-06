import assert from "node:assert/strict";
import test from "node:test";
import { fractionsOf } from "./pages";

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
