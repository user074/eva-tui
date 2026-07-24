import assert from "node:assert/strict";
import test from "node:test";

import {
  renderGraphicAnsi,
  rgbaToAnsiQuadrants,
} from "../src/graphics/ansi.js";

test("ANSI quadrant encoder preserves solid fields and diagonal edges", () => {
  const solid = rgbaToAnsiQuadrants(
    Uint8Array.from([
      230, 0, 3,
      230, 0, 3,
      230, 0, 3,
      230, 0, 3,
    ]),
    2,
    2,
    3,
  );
  assert.match(solid, /\u001b\[48;2;230;0;3m /);

  const diagonal = rgbaToAnsiQuadrants(
    Uint8Array.from([
      230, 0, 3,
      3, 3, 3,
      3, 3, 3,
      230, 0, 3,
    ]),
    2,
    2,
    3,
  );
  assert.match(diagonal, /[▚▞]/);
  assert.match(diagonal, /\u001b\[38;2;/);
  assert.match(diagonal, /\u001b\[48;2;/);
});

test("reference composition renders through the portable ANSI raster backend", async () => {
  const rendered = await renderGraphicAnsi({
    scene: "tsunami",
    columns: 36,
    rows: 8,
  });
  assert.equal(rendered.split("\n").length, 8);
  assert.match(rendered, /[▘▝▀▖▌▞▛▗▚▐▜▄▙▟█]/);
  assert.match(rendered, /\u001b\[48;2;/);
});
