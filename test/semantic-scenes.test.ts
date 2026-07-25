import assert from "node:assert/strict";
import test from "node:test";

import type { Station } from "../src/ui/operations-model.js";
import {
  drawAssetDataHex,
  drawAssetSkewBlade,
} from "../src/ui/asset-cell-masks.js";
import {
  denseDiagonalStripe,
  drawBrailleWaveform,
  drawDossier,
  drawFilledDiamond,
  drawFilledRectPanel,
  drawHorizontalTriangle,
  drawRectStatusBlock,
  drawSquareWarningTile,
  drawWarningField,
  drawVerticalTriangle,
} from "../src/ui/tui-primitives.js";
import {
  buildEarthquakeFrame,
  buildStationFrame,
  buildSynchronizationFrame,
  buildTsunamiFrame,
} from "../src/ui/semantic-scenes.js";
import { earthquakeSynchronizationAtPhase } from "../src/ui/semantic-graphic-view.js";
import {
  TuiFrame,
  tuiFrameToAnsi,
  tuiFrameToAnsiRows,
  tuiFrameToRuns,
  tuiFrameToText,
  tuiTextWidth,
} from "../src/ui/tui-frame.js";

const stations: Station[] = [
  {
    id: "codex",
    label: "CODEX CORE",
    detail: "MODEL",
    status: "ONLINE",
    trace: "──────────▃",
    eventCount: 1,
  },
  {
    id: "shell",
    label: "SHELL-01",
    detail: "COMMAND",
    status: "ACTIVE",
    trace: "──────────▇",
    eventCount: 4,
  },
  {
    id: "git",
    label: "GIT CONTROL",
    detail: "VERSION",
    status: "FAILED",
    trace: "──────────█",
    eventCount: 2,
  },
];

test("terminal frame preserves cell backgrounds when semantic text is layered", () => {
  const frame = new TuiFrame(12, 2);
  frame.fill(0, 0, 12, 1, " ", { background: "#ff0000" });
  frame.text(2, 0, "ALERT", {
    color: "#000000",
    bold: true,
    blink: true,
  });

  const row = frame.rows()[0];
  assert.equal(row?.[2]?.char, "A");
  assert.equal(row?.[2]?.background, "#ff0000");
  assert.equal(row?.[2]?.bold, true);
  assert.equal(row?.[2]?.blink, true);
  assert.match(tuiFrameToAnsi(frame), /\u001b\[48;2;255;0;0m/);
  assert.match(tuiFrameToAnsi(frame), /\u001b\[5m/);
  assert.equal(tuiFrameToAnsiRows(frame).length, 2);
  assert.equal(
    tuiFrameToAnsi(frame),
    tuiFrameToAnsiRows(frame).join("\n"),
  );
  const runs = tuiFrameToRuns(frame);
  assert.equal(runs.length, 2);
  assert.ok(
    runs[0]?.some(
      (run) =>
        run.text.includes("ALERT") &&
        run.background === "#ff0000" &&
        run.bold &&
        run.blink,
    ),
  );
});

test("terminal frame accounts for Japanese double-width labels", () => {
  const frame = new TuiFrame(8, 1);
  frame.text(0, 0, "津波");

  assert.equal(tuiTextWidth("津波"), 4);
  assert.equal(frame.rows()[0]?.[1]?.continuation, true);
  assert.equal(frame.rows()[0]?.[3]?.continuation, true);
  assert.equal(tuiFrameToText(frame).length, 6);
});

test("dense diagonal motifs remain one terminal cell per glyph", () => {
  assert.equal(tuiTextWidth("◢◤"), 2);
  assert.equal(denseDiagonalStripe(8), "◢◤◢◤◢◤◢◤");
  assert.equal(denseDiagonalStripe(8, 0, true), "◣◥◣◥◣◥◣◥");
  assert.equal(tuiTextWidth(denseDiagonalStripe(13, 2)), 13);
});

test("dossiers use matching warning bands and simple vertical side pairs", () => {
  const frame = new TuiFrame(24, 10, { background: "#090807" });
  drawDossier(frame, {
    x: 1,
    y: 1,
    width: 22,
    height: 8,
    title: "ALERT",
    border: "#ff3b21",
    phase: 0,
  });

  assert.equal(
    frame
      .rows()[2]
      ?.slice(2, 22)
      .map((cell) => cell.char)
      .join(""),
    "◢◤".repeat(10),
  );
  assert.equal(
    frame
      .rows()[7]
      ?.slice(2, 22)
      .map((cell) => cell.char)
      .join(""),
    "◢◤".repeat(10),
  );
  for (let y = 3; y < 7; y += 1) {
    assert.equal(
      [frame.cell(2, y)?.char, frame.cell(3, y)?.char].join(""),
      "◢◤",
    );
    assert.equal(
      [frame.cell(20, y)?.char, frame.cell(21, y)?.char].join(""),
      "◢◤",
    );
    for (const x of [2, 3, 20, 21]) {
      assert.equal(frame.cell(x, y)?.color, "#ff3b21");
      assert.equal(frame.cell(x, y)?.background, "#090807");
    }
  }
});

test("filled triangle primitives compose across multiple terminal rows", () => {
  const frame = new TuiFrame(24, 7);
  drawVerticalTriangle(frame, 6, 0, 2, "up", "#ff3b21");
  drawVerticalTriangle(frame, 6, 2, 2, "down", "#ff3b21");
  drawHorizontalTriangle(
    frame,
    12,
    1,
    3,
    5,
    "left",
    "#ffc247",
    "#ff3b21",
  );
  drawHorizontalTriangle(
    frame,
    15,
    1,
    3,
    5,
    "right",
    "#ffc247",
    "#ff3b21",
  );
  const output = tuiFrameToText(frame);

  assert.match(output, /◢◣/);
  assert.match(output, /◢▇▇◣/);
  assert.match(output, /◥▇▇◤/);
  assert.match(output, /◀/);
  assert.match(output, /▶/);
});

test("Braille waveform uses a connected animated 2x4 subcell signal", () => {
  const early = new TuiFrame(32, 3, { background: "#090807" });
  const later = new TuiFrame(32, 3, { background: "#090807" });
  drawBrailleWaveform(early, 1, 0, 30, 3, 1);
  drawBrailleWaveform(later, 1, 0, 30, 3, 7);
  const earlyText = tuiFrameToText(early);
  const laterText = tuiFrameToText(later);
  const signalCells = early
    .rows()
    .flatMap((row) => row)
    .filter((cell) => /[\u2800-\u28ff]/u.test(cell.char));

  assert.ok(signalCells.length > 20);
  assert.notEqual(earlyText, laterText);
});

test("waveform synchronization converges distinct colored sine traces", () => {
  const separated = new TuiFrame(48, 4, { background: "#090807" });
  const aligned = new TuiFrame(48, 4, { background: "#090807" });
  drawBrailleWaveform(separated, 0, 0, 48, 4, 3, "#3ce6e6", 0);
  drawBrailleWaveform(aligned, 0, 0, 48, 4, 3, "#3ce6e6", 100);
  const dotCount = (frame: TuiFrame): number =>
    frame
      .rows()
      .flatMap((row) => row)
      .reduce((total, cell) => {
        const codePoint = cell.char.codePointAt(0) ?? 0;
        if (codePoint < 0x2800 || codePoint > 0x28ff) return total;
        const mask = codePoint - 0x2800;
        return total + mask.toString(2).replaceAll("0", "").length;
      }, 0);
  const separatedColors = new Set(
    separated
      .rows()
      .flatMap((row) => row)
      .filter((cell) => /[\u2800-\u28ff]/u.test(cell.char))
      .map((cell) => cell.color),
  );

  assert.ok(dotCount(separated) > dotCount(aligned) * 1.8);
  assert.ok(separatedColors.size >= 3);
});

test("conversation synchronization frame reserves a readable waveform field", () => {
  const frame = buildSynchronizationFrame({
    columns: 72,
    rows: 6,
    phase: 3,
    percent: 42,
    status: "LINK DECAY",
    detail: "HUMAN WAIT 19.0S // 2 EXCHANGES",
  });
  const output = tuiFrameToText(frame);
  const brailleRows = frame
    .rows()
    .filter((row) => row.some((cell) => /[\u2800-\u28ff]/u.test(cell.char)));

  assert.match(output, /CODEX SYNCHRONIZATION RATIO/);
  assert.match(output, /LINK DECAY/);
  assert.ok(brailleRows.length >= 3);
});

test("earthquake simulation synchronization sweeps from zero to lock in ten seconds", () => {
  assert.equal(earthquakeSynchronizationAtPhase(0), 0);
  assert.equal(earthquakeSynchronizationAtPhase(5), 20);
  assert.equal(earthquakeSynchronizationAtPhase(12), 48);
  assert.equal(earthquakeSynchronizationAtPhase(25), 100);
  assert.equal(earthquakeSynchronizationAtPhase(250), 100);
});

test("rectangular panels use gapless background fills and solid index tabs", () => {
  const frame = new TuiFrame(30, 7, { background: "#090807" });
  drawFilledRectPanel(frame, {
    x: 1,
    y: 1,
    width: 18,
    height: 5,
    title: "WARNING",
    subtitle: "ACTIVE",
    fill: "#ff3b21",
    border: "#090807",
    text: "#090807",
    railInset: 3,
  });
  drawRectStatusBlock(
    frame,
    21,
    2,
    8,
    2,
    -1,
    "#2ee66b",
    "#ffc247",
  );
  const cells = frame.rows().flatMap((row) => row);

  assert.equal(frame.cell(1, 1)?.background, "#ff3b21");
  assert.equal(frame.cell(18, 5)?.background, "#ff3b21");
  assert.equal(frame.cell(21, 3)?.background, "#ffc247");
  assert.equal(frame.cell(24, 3)?.background, "#2ee66b");
  assert.ok(!cells.some((cell) => "◢◣◤◥".includes(cell.char)));
});

test("filled diamonds use symmetric background scanlines without edge glyphs", () => {
  const frame = new TuiFrame(17, 7, { background: "#090807" });
  drawFilledDiamond(frame, 2, 0, 13, 7, "#ff3b21", "WARNING");
  const redCellsPerRow = frame.rows().map(
    (row) => row.filter((cell) => cell.background === "#ff3b21").length,
  );

  assert.deepEqual(redCellsPerRow, [1, 5, 9, 13, 9, 5, 1]);
  assert.ok(
    !frame
      .rows()
      .flatMap((row) => row)
      .some((cell) => "◢◣◤◥▇".includes(cell.char)),
  );
  assert.match(tuiFrameToText(frame), /WARNING/);
});

test("filled diamonds can add sparse triangle tips without changing their core fill", () => {
  const frame = new TuiFrame(14, 5, { background: "#090807" });
  drawFilledDiamond(
    frame,
    2,
    0,
    10,
    5,
    "#ff3b21",
    "WARNING",
    true,
  );
  const output = tuiFrameToText(frame);
  const redCellsPerRow = frame.rows().map(
    (row) => row.filter((cell) => cell.background === "#ff3b21").length,
  );

  assert.deepEqual(redCellsPerRow, [0, 6, 10, 6, 0]);
  assert.match(output, /◢◣/);
  assert.match(output, /◥◤/);
  assert.match(output, /WARNING/);
});

test("square warning tiles use closed corners and one triangle per marker row", () => {
  const frame = new TuiFrame(9, 5, { background: "#090807" });
  drawSquareWarningTile(frame, 0, 0, 9, 5, "#ff3b21");
  const output = tuiFrameToText(frame);
  const cells = frame.rows().flatMap((row) => row);

  assert.ok(cells.every((cell) => cell.background === "#ff3b21"));
  assert.match(output, /┏━━━━━━━┓/);
  assert.match(output, /┗━━━━━━━┛/);
  assert.doesNotMatch(output, /╋/);
  assert.equal(Array.from(output).filter((character) => character === "▲").length, 1);
  assert.match(output, /WARNING/);
  assert.equal(Array.from(output).filter((character) => character === "▼").length, 1);
});

test("warning field balances three-column side gutters with two-row vertical gutters", () => {
  const frame = new TuiFrame(24, 12, { background: "#090807" });
  drawWarningField(frame, 0);

  for (let x = 9; x < 12; x += 1) {
    assert.equal(frame.cell(x, 2)?.background, "#090807");
  }
  for (let y = 5; y < 7; y += 1) {
    assert.equal(frame.cell(4, y)?.background, "#090807");
  }
  assert.equal(frame.cell(12, 0)?.background, "#b51224");
  assert.equal(frame.cell(0, 7)?.background, "#b51224");
});

test("warning field fades complete tile columns from left to right on entrance", () => {
  const hidden = new TuiFrame(48, 12, { background: "#090807" });
  drawWarningField(hidden, 0, "#b51224", 0);
  assert.doesNotMatch(tuiFrameToText(hidden), /WARNING/);
  assert.ok(
    hidden
      .rows()
      .flatMap((row) => row)
      .every((cell) => cell.background === "#090807"),
  );

  const sweeping = new TuiFrame(48, 12, { background: "#090807" });
  drawWarningField(sweeping, 0, "#b51224", 3);
  assert.notEqual(sweeping.cell(0, 0)?.background, "#090807");
  assert.notEqual(sweeping.cell(12, 0)?.background, "#090807");
  assert.equal(sweeping.cell(24, 0)?.background, "#090807");
  assert.equal(sweeping.cell(36, 0)?.background, "#090807");

  const revealed = new TuiFrame(48, 12, { background: "#090807" });
  drawWarningField(revealed, 0, "#b51224", 11);
  assert.equal(revealed.cell(36, 0)?.background, "#b51224");
  assert.match(tuiFrameToText(revealed), /WARNING/);
});

test("reference SVG geometry maps to cell-native caps and filled spans", () => {
  const frame = new TuiFrame(38, 9, { background: "#090807" });
  drawAssetDataHex(frame, 1, 1, 24, 7, "#ff3b21");
  drawAssetSkewBlade(frame, 27, 3, 10, 3, -1, "#2ee66b");
  const cells = frame.rows().flatMap((row) => row);
  const output = tuiFrameToText(frame);

  assert.match(output, /[◤◥][━ ]+[◥◤]/);
  assert.match(output, /[◣◢][━ ]+[◢◣]/);
  assert.doesNotMatch(output, /[▖▗▘▝▚▞▙▛▜▟]/);
  assert.ok(
    cells.filter((cell) => cell.background === "#ff3b21").length > 60,
    "the SVG-derived hex should retain a filled red surface",
  );
  assert.ok(
    cells.some(
      (cell) =>
        cell.background === "#2ee66b" ||
        (cell.color === "#2ee66b" && "◢◣◤◥".includes(cell.char)),
    ),
    "the SVG-derived station blade should retain its green skew surface",
  );
});

test("earthquake composition preserves the upstream assembly semantics", () => {
  const frame = buildEarthquakeFrame({
    columns: 100,
    rows: 29,
    phase: 4,
    simulation: true,
    synchronizationPercent: 35,
    incidentDetail: "Fixture command failure detected.",
  });
  const output = tuiFrameToText(frame);

  assert.equal(frame.width, 100);
  assert.equal(frame.height, 29);
  assert.match(output, /EARTHQUAKE/);
  assert.match(output, /WARNING \/ GEMPA BUMI/);
  assert.match(output, /MAGNITUDE/);
  assert.match(output, /SYNC LINK/);
  assert.match(output, /DEPTH/);
  assert.match(output, /TEST INCIDENT DOSSIER/);
  assert.match(output, /[◢◣◤◥]/);
  assert.match(output, /SYNC 035%/);
  assert.match(output, /[\u2800-\u28ff]/);
  assert.ok(
    frame
      .rows()
      .flatMap((row) => row)
      .some(
        (cell) =>
          cell.color === "#3ce6e6" &&
          /[\u2800-\u28ff]/u.test(cell.char),
      ),
    "earthquake dossier should retain the animated cyan synchronization scope",
  );
  assert.ok(
    frame
      .rows()
      .flatMap((row) => row)
      .filter((cell) => cell.background === "#ff3b21").length > 180,
    "earthquake modules should be solid color masses",
  );
  assert.ok(
    frame
      .rows()
      .flatMap((row) => row)
      .filter((cell) => cell.background === "#ffc247").length > 100,
    "earthquake warnings and sync module should use solid amber masses",
  );
});

test("tsunami composition is a warning field with six placards and a dossier", () => {
  const frame = buildTsunamiFrame({
    columns: 100,
    rows: 29,
    phase: 24,
  });
  const output = tuiFrameToText(frame);

  assert.match(output, /PERINGATAN DINI TSUNAMI/);
  assert.match(output, /POTENSI TSUNAMI \/ CHANGE PROPAGATION/);
  assert.match(output, /ZONE 1/);
  assert.match(output, /ZONE 6/);
  assert.match(output, /AWAS \/ CRITICAL/);
  assert.match(output, /NODE-03/);
  assert.match(output, /╭/);
  assert.match(output, /[◢◣◤◥]/);
  assert.equal(frame.cell(21, 1)?.background, "#ff3b21");
  assert.equal(frame.cell(78, 5)?.background, "#ff3b21");
  const hazardCells = frame
    .rows()
    .flatMap((row) => row)
    .filter(
      (cell) =>
        cell.background === "#ff3b21" ||
        cell.background === "#b51224",
    );
  assert.ok(
    hazardCells.length > 700,
    "tsunami warning field should be predominantly background-filled",
  );
});

test("station composition maps state to alternating connected rib nodes", () => {
  const frame = buildStationFrame({
    columns: 78,
    rows: 18,
    phase: 4,
    stations,
    selectedIndex: 1,
  });
  const output = tuiFrameToText(frame);
  const cells = frame.rows().flatMap((row) => row);

  assert.match(output, /RIB-01/);
  assert.match(output, /CODEX/);
  assert.match(output, /SHELL/);
  assert.match(output, /\[ACT 04\]/);
  assert.ok(
    cells.filter((cell) => cell.background === "#2ee66b").length > 10,
    "nominal stations should use filled green rectangular surfaces",
  );
  assert.ok(
    !cells.some((cell) => "◢◣◤◥".includes(cell.char)),
    "station blocks should not rely on diagonal polygon caps",
  );
  assert.ok(
    cells.some(
      (cell) =>
        cell.blink &&
        cell.color === "#f6ead7" &&
        ["◆", "▶", "◀"].includes(cell.char),
    ),
    "selected station should retain a terminal-driven marker",
  );
});

test("operational motion continues independently of the entrance phase", () => {
  const early = tuiFrameToText(
    buildTsunamiFrame({
      columns: 100,
      rows: 29,
      phase: 24,
      motionPhase: 1,
    }),
  );
  const later = tuiFrameToText(
    buildTsunamiFrame({
      columns: 100,
      rows: 29,
      phase: 24,
      motionPhase: 9,
    }),
  );

  assert.match(early, /PROPAGATION/);
  assert.match(later, /PROPAGATION/);
  assert.notEqual(early, later);

  const earlyEarthquake = tuiFrameToText(
    buildEarthquakeFrame({
      columns: 100,
      rows: 29,
      phase: 24,
      motionPhase: 1,
      synchronizationPercent: 45,
      simulation: true,
      incidentDetail: "Fixture failure.",
    }),
  );
  const laterEarthquake = tuiFrameToText(
    buildEarthquakeFrame({
      columns: 100,
      rows: 29,
      phase: 24,
      motionPhase: 9,
      synchronizationPercent: 45,
      simulation: true,
      incidentDetail: "Fixture failure.",
    }),
  );
  assert.match(earlyEarthquake, /SYNC 045%/);
  assert.notEqual(earlyEarthquake, laterEarthquake);
});

test("semantic warning scenes retain hierarchy in a compact terminal", () => {
  const earthquake = tuiFrameToText(
    buildEarthquakeFrame({
      columns: 78,
      rows: 21,
      phase: 1,
      simulation: true,
      incidentDetail: "Fixture failure.",
    }),
  );
  const tsunami = tuiFrameToText(
    buildTsunamiFrame({ columns: 78, rows: 21, phase: 1 }),
  );

  assert.match(earthquake, /Fixture failure/);
  assert.match(earthquake, /SYNC LINK/);
  assert.match(earthquake, /[\u2800-\u28ff]/);
  assert.match(tsunami, /PROPAGATION/);
  assert.match(tsunami, /PACIFIC FIXTURE GRID/);
});
