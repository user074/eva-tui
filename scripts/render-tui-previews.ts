import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

import type { Station } from "../src/ui/operations-model.js";
import {
  buildEarthquakeFrame,
  buildStationFrame,
  buildTsunamiFrame,
} from "../src/ui/semantic-scenes.js";
import type { TuiFrame } from "../src/ui/tui-frame.js";

const outputDirectory = resolve(
  process.argv[2] ?? "/tmp/eva-tui-previews",
);
const cellWidth = 10;
const cellHeight = 18;

const stations: Station[] = [
  ["codex", "CODEX CORE", "GPT-5", "ONLINE"],
  ["shell", "SHELL-01", "COMMAND EXECUTION", "ACTIVE"],
  ["git", "GIT CONTROL", "VERSION OPERATIONS", "READY"],
  ["workspace", "WORKSPACE", "FILE CHANGE LINK", "CHANGED"],
  ["tools", "TOOL BUS", "DYNAMIC OPERATIONS", "ONLINE"],
  ["agents", "AGENT LINK", "COLLABORATION BUS", "STANDBY"],
  ["audio", "AUDIO", "AMBIENT CONTROL", "PLAYING"],
  ["thread", "THREAD CORE", "019F9299", "READY"],
  ["plan", "PLAN SYNC", "4/7 STEPS", "ACTIVE"],
  ["context", "CONTEXT", "41% WINDOW", "NOMINAL"],
  ["diff", "DIFF FIELD", "+240/-32", "CHANGED"],
  ["approval", "APPROVAL GATE", "OPERATOR", "READY"],
].map(([id, label, detail, status], index) => ({
  id: id ?? `station-${index}`,
  label: label ?? "STATION",
  detail: detail ?? "NO DETAIL",
  status: status ?? "STANDBY",
  trace: "────────▃▇",
  eventCount: index + 1,
}));

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function frameToSvg(frame: TuiFrame): string {
  const width = frame.width * cellWidth;
  const height = frame.height * cellHeight;
  const backgrounds: string[] = [];
  const glyphs: string[] = [];

  frame.rows().forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.continuation) return;
      if (cell.background) {
        backgrounds.push(
          `<rect x="${x * cellWidth}" y="${y * cellHeight}" width="${cellWidth}" height="${cellHeight}" fill="${cell.background}"/>`,
        );
      }
      if (cell.char !== " ") {
        glyphs.push(
          `<text x="${x * cellWidth}" y="${y * cellHeight + 15}" fill="${cell.color ?? "#f6ead7"}" font-family="Menlo, Monaco, 'Courier New', monospace" font-size="15" font-weight="${cell.bold ? "700" : "400"}" opacity="${cell.dim ? "0.55" : "1"}">${escapeXml(cell.char)}</text>`,
        );
      }
    });
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#090807"/>`,
    ...backgrounds,
    ...glyphs,
    "</svg>",
  ].join("");
}

async function writePreview(name: string, frame: TuiFrame): Promise<void> {
  const svg = frameToSvg(frame);
  const svgPath = resolve(outputDirectory, `${name}.svg`);
  const pngPath = resolve(outputDirectory, `${name}.png`);
  await writeFile(svgPath, svg);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  process.stdout.write(`${pngPath}\n`);
}

await mkdir(outputDirectory, { recursive: true });
await writePreview(
  "earthquake-100x29",
  buildEarthquakeFrame({
    columns: 100,
    rows: 29,
    phase: 4,
    synchronizationPercent: 35,
    simulation: true,
    incidentDetail:
      "Fixture command failure detected in the simulated execution layer.",
  }),
);
for (const synchronizationPercent of [0, 50, 100] as const) {
  await writePreview(
    `earthquake-sync-${synchronizationPercent
      .toString()
      .padStart(3, "0")}-100x29`,
    buildEarthquakeFrame({
      columns: 100,
      rows: 29,
      phase: 4,
      motionPhase: 4,
      synchronizationPercent,
      simulation: true,
      incidentDetail:
        "Fixture command failure detected in the simulated execution layer.",
    }),
  );
}
await writePreview(
  "tsunami-100x29",
  buildTsunamiFrame({
    columns: 100,
    rows: 29,
    phase: 24,
  }),
);
for (const phase of [0, 3, 6, 9] as const) {
  await writePreview(
    `tsunami-entrance-${phase.toString().padStart(2, "0")}-100x29`,
    buildTsunamiFrame({
      columns: 100,
      rows: 29,
      phase,
      motionPhase: 4,
    }),
  );
}
await writePreview(
  "stations-94x20",
  buildStationFrame({
    columns: 94,
    rows: 20,
    phase: 4,
    stations,
    selectedIndex: 4,
  }),
);
await writePreview(
  "earthquake-78x21",
  buildEarthquakeFrame({
    columns: 78,
    rows: 21,
    phase: 4,
    synchronizationPercent: 35,
    simulation: true,
    incidentDetail: "Fixture command failure / simulated execution layer.",
  }),
);
await writePreview(
  "tsunami-78x21",
  buildTsunamiFrame({
    columns: 78,
    rows: 21,
    phase: 24,
  }),
);
