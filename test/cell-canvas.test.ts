import assert from "node:assert/strict";
import test from "node:test";

import { CellCanvas } from "../src/ui/cell-canvas.js";
import { frameToAnsi } from "../src/ui/cell-canvas-view.js";
import {
  earthquakeGraphic,
  stationGraphic,
  tsunamiGraphic,
} from "../src/ui/scene-graphics.js";
import type { Station } from "../src/ui/operations-model.js";

test("braille encoder maps a 2x4 pixel cell to the correct dot bits", () => {
  const canvas = new CellCanvas(1, 1);
  canvas.plot(0, 0, "#ff0000");
  canvas.plot(1, 3, "#00ff00");

  const cell = canvas.toFrame()[0]?.[0];
  assert.equal(cell?.char.codePointAt(0), 0x2800 + 0x01 + 0x80);
  assert.equal(cell?.color, "#00ff00");
});

test("ANSI renderer compacts a frame into one true-color text buffer", () => {
  const canvas = new CellCanvas(2, 1);
  canvas.plot(0, 0, "#ff3b21");
  canvas.plot(2, 0, "#2ee66b");
  const output = frameToAnsi(canvas.toFrame());

  assert.match(output, /\u001b\[38;2;255;59;33m/);
  assert.match(output, /\u001b\[38;2;46;230;107m/);
  assert.ok(output.endsWith("\u001b[39m"));
});

test("drawing primitives clip safely and fill polygon interiors", () => {
  const canvas = new CellCanvas(8, 4);
  canvas.line({ x: -20, y: -20 }, { x: 40, y: 20 }, "red");
  canvas.polygon(
    [
      { x: 4, y: 2 },
      { x: 12, y: 2 },
      { x: 8, y: 12 },
    ],
    "orange",
    true,
  );

  const frame = canvas.toFrame();
  assert.equal(frame.length, 4);
  assert.equal(frame[0]?.length, 8);
  assert.ok(
    frame.flat().filter((cell) => cell.char !== " ").length >= 5,
    "expected the polygon to occupy multiple Braille cells",
  );
});

test("scene graphics produce dense, correctly sized terminal frames", () => {
  const earthquake = earthquakeGraphic(42, 7, 3);
  const tsunami = tsunamiGraphic(42, 8, 5);

  assert.deepEqual(
    [earthquake.length, earthquake[0]?.length],
    [7, 42],
  );
  assert.deepEqual([tsunami.length, tsunami[0]?.length], [8, 42]);
  assert.ok(earthquake.flat().filter((cell) => cell.char !== " ").length > 45);
  assert.ok(tsunami.flat().filter((cell) => cell.char !== " ").length > 35);
});

test("station graphic highlights topology from station state", () => {
  const stations: Station[] = [
    {
      id: "codex",
      label: "CODEX",
      detail: "CORE",
      status: "ONLINE",
      trace: "───────────▃",
      eventCount: 1,
    },
    {
      id: "shell",
      label: "SHELL",
      detail: "COMMAND",
      status: "RUNNING",
      trace: "───────────▇",
      eventCount: 1,
    },
    {
      id: "git",
      label: "GIT",
      detail: "VERSION",
      status: "FAILED",
      trace: "───────────█",
      eventCount: 1,
    },
  ];

  const frame = stationGraphic(stations, 1, 48, 8, 4);
  const colors = new Set(frame.flat().map((cell) => cell.color).filter(Boolean));
  assert.equal(frame.length, 8);
  assert.ok(colors.size >= 3);
});
