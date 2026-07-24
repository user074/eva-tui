import { readFile } from "node:fs/promises";

import type { Station } from "../ui/operations-model.js";

export type GraphicScene = "earthquake" | "tsunami" | "stations";

export interface GraphicCompositionOptions {
  scene: GraphicScene;
  columns: number;
  rows: number;
  stations?: Station[];
  selectedIndex?: number;
  incidentDetail?: string;
  simulation?: boolean;
}

const ASSET_NAMES = [
  "long_shape.svg",
  "strip.svg",
  "warning_shape_black.svg",
  "warning_gempa_black.svg",
  "warning_gempa_red_yellow.svg",
  "warning_tsunami_yellow.png",
  "warning_hex_red.png",
  "SkewRectangle_Green.svg",
  "SkewRectangle_Green_Flip.svg",
  "SkewRectangle_Red.svg",
  "SkewRectangle_Red_Flip.svg",
] as const;

type AssetName = (typeof ASSET_NAMES)[number];
type AssetCatalog = Readonly<Record<AssetName, string>>;

let catalogPromise: Promise<AssetCatalog> | undefined;
const renderCache = new Map<string, Promise<Buffer>>();

function assetMime(name: AssetName): string {
  return name.endsWith(".svg") ? "image/svg+xml" : "image/png";
}

async function loadCatalog(): Promise<AssetCatalog> {
  catalogPromise ??= Promise.all(
    ASSET_NAMES.map(async (name) => {
      const path = new URL(`../../assets/ews-concept-new/images/${name}`, import.meta.url);
      const data = await readFile(path);
      return [
        name,
        `data:${assetMime(name)};base64,${data.toString("base64")}`,
      ] as const;
    }),
  ).then((entries) => Object.fromEntries(entries) as Record<AssetName, string>);
  return catalogPromise;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function short(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function baseSvg(
  width: number,
  height: number,
  body: string,
  assets: AssetCatalog,
): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="#fc3b16" opacity=".075"/>
        </pattern>
        <pattern id="hazard" width="240" height="25" patternUnits="userSpaceOnUse">
          <rect width="240" height="25" fill="#050505"/>
          <image href="${assets["strip.svg"]}" width="240" height="25" preserveAspectRatio="none"/>
        </pattern>
        <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="amberGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#fcae16"/>
        </filter>
        <style>
          text { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
          .amber { fill: #fcae16; }
          .orange { fill: #fc8416; }
          .red { fill: #e60003; }
          .white { fill: #fff8e8; }
          .label { font-weight: 800; letter-spacing: 2px; }
          .micro { font-size: 13px; letter-spacing: 1.5px; }
        </style>
      </defs>
      <rect width="100%" height="100%" fill="#030303"/>
      ${body}
      <rect width="100%" height="100%" fill="url(#scanlines)" pointer-events="none"/>
    </svg>
  `;
}

function band(
  y: number,
  width: number,
  height: number,
  title: string,
  reverse = false,
): string {
  const stripHeight = Math.max(10, Math.round(height * 0.24));
  const centerHeight = height - stripHeight * 2;
  const labels = Array.from({ length: 5 }, (_, index) => {
    const x = ((index + 0.5) * width) / 5;
    return `<text x="${x}" y="${y + stripHeight + centerHeight * 0.68}" text-anchor="middle" class="amber label" font-size="${Math.max(18, centerHeight * 0.48)}">${xml(title)}</text>`;
  }).join("");
  return `
    <g>
      <rect x="0" y="${y}" width="${width}" height="${stripHeight}" fill="url(#hazard)" ${reverse ? 'transform="scale(-1 1)" transform-origin="center"' : ""}/>
      <rect x="4" y="${y + stripHeight}" width="${width - 8}" height="${centerHeight}" rx="8" fill="#030303" stroke="#e60003" stroke-width="3"/>
      ${labels}
      <rect x="0" y="${y + stripHeight + centerHeight}" width="${width}" height="${stripHeight}" fill="url(#hazard)" ${reverse ? 'transform="scale(-1 1)" transform-origin="center"' : ""}/>
    </g>
  `;
}

function hex(
  cx: number,
  cy: number,
  width: number,
  height: number,
  fill: string,
  stroke = "#e60003",
): string {
  const x = cx - width / 2;
  const y = cy - height / 2;
  const inset = width * 0.22;
  const points = [
    `${x + inset},${y}`,
    `${x + width - inset},${y}`,
    `${x + width},${cy}`,
    `${x + width - inset},${y + height}`,
    `${x + inset},${y + height}`,
    `${x},${cy}`,
  ].join(" ");
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`;
}

function earthquakeSvg(
  width: number,
  height: number,
  assets: AssetCatalog,
  incidentDetail: string,
  simulation: boolean,
): string {
  const bandHeight = Math.max(62, height * 0.13);
  const headerWidth = Math.min(width * 0.38, 520);
  const headerHeight = headerWidth * (510 / 1564);
  const headerX = (width - headerWidth) / 2;
  const headerY = Math.max(bandHeight + 28, height * 0.25);
  const warningSize = Math.max(90, Math.min(150, height * 0.21));
  const sideGap = Math.max(12, width * 0.012);
  const dataY = headerY + headerHeight * 1.45;
  const dataWidth = Math.max(105, Math.min(155, width * 0.11));
  const dataHeight = dataWidth * 0.9;
  const iconWidth = Math.max(62, Math.min(92, height * 0.13));
  const iconHeight = iconWidth * (416 / 264);

  return baseSvg(
    width,
    height,
    `
      ${band(0, width, bandHeight, "EARTHQUAKE")}
      ${band(height - bandHeight, width, bandHeight, "EARTHQUAKE", true)}

      <g filter="url(#redGlow)">
        <image href="${assets["long_shape.svg"]}" x="${headerX}" y="${headerY}" width="${headerWidth}" height="${headerHeight}"/>
        <image href="${assets["warning_gempa_black.svg"]}" x="${headerX + headerWidth * 0.08}" y="${headerY + headerHeight * 0.23}" width="${headerHeight * 0.52}" height="${headerHeight * 0.52}"/>
        <image href="${assets["warning_gempa_black.svg"]}" x="${headerX + headerWidth * 0.82}" y="${headerY + headerHeight * 0.23}" width="${headerHeight * 0.52}" height="${headerHeight * 0.52}"/>
        <text x="${width / 2}" y="${headerY + headerHeight * 0.51}" text-anchor="middle" fill="#050505" class="label" font-size="${Math.max(24, headerHeight * 0.23)}">WARNING</text>
        <text x="${width / 2}" y="${headerY + headerHeight * 0.72}" text-anchor="middle" fill="#050505" font-weight="700" font-size="${Math.max(13, headerHeight * 0.11)}">Gempa Bumi Terdeteksi</text>
      </g>

      <image href="${assets["warning_shape_black.svg"]}" x="${headerX - warningSize - sideGap}" y="${headerY + headerHeight * 0.52}" width="${warningSize}" height="${warningSize * 0.87}" filter="url(#redGlow)"/>
      <image href="${assets["warning_shape_black.svg"]}" x="${headerX + headerWidth + sideGap}" y="${headerY + headerHeight * 0.52}" width="${warningSize}" height="${warningSize * 0.87}" filter="url(#redGlow)"/>

      ${hex(width / 2 - dataWidth * 0.86, dataY, dataWidth, dataHeight, "#dc2c1f")}
      ${hex(width / 2, dataY + dataHeight * 0.72, dataWidth, dataHeight, "#dc2c1f")}
      ${hex(width / 2 + dataWidth * 0.86, dataY, dataWidth, dataHeight, "#dc2c1f")}

      <text x="${width / 2 - dataWidth * 0.86}" y="${dataY - 3}" text-anchor="middle" class="amber" font-size="${Math.max(26, dataWidth * 0.22)}">6.5</text>
      <text x="${width / 2 - dataWidth * 0.86}" y="${dataY + 23}" text-anchor="middle" class="amber micro">MAGNITUDO</text>
      <text x="${width / 2 + dataWidth * 0.86}" y="${dataY - 3}" text-anchor="middle" class="amber" font-size="${Math.max(22, dataWidth * 0.18)}">10 KM</text>
      <text x="${width / 2 + dataWidth * 0.86}" y="${dataY + 23}" text-anchor="middle" class="amber micro">KEDALAMAN</text>

      <image href="${assets["warning_gempa_red_yellow.svg"]}" x="${headerX - iconWidth * 0.98}" y="${dataY + dataHeight * 0.1}" width="${iconWidth}" height="${iconHeight}"/>
      <image href="${assets["warning_gempa_red_yellow.svg"]}" x="${headerX + headerWidth - iconWidth * 0.02}" y="${dataY + dataHeight * 0.1}" width="${iconWidth}" height="${iconHeight}"/>

      <rect x="${width * 0.02}" y="${bandHeight + 10}" width="${Math.max(205, width * 0.22)}" height="30" fill="${simulation ? "#fcae16" : "#e60003"}"/>
      <text x="${width * 0.025}" y="${bandHeight + 31}" fill="#050505" class="label" font-size="15">${simulation ? "試験 / SIMULATION" : "警告 / OPERATION FAILURE"}</text>
      <text x="${width / 2}" y="${height - bandHeight - 17}" text-anchor="middle" class="white micro">${xml(short(incidentDetail, 92))}</text>
    `,
    assets,
  );
}

function tsunamiSvg(
  width: number,
  height: number,
  assets: AssetCatalog,
): string {
  const headerWidth = Math.min(width * 0.34, 500);
  const headerHeight = headerWidth * (510 / 1564);
  const headerX = (width - headerWidth) / 2;
  const headerY = Math.max(46, height * 0.16);
  const dossierWidth = Math.min(width * 0.44, 620);
  const dossierHeight = Math.min(height * 0.39, 260);
  const dossierX = (width - dossierWidth) / 2;
  const dossierY = Math.max(headerY + headerHeight * 1.3, height * 0.44);
  const placardWidth = Math.max(58, Math.min(96, height * 0.14));
  const placardHeight = placardWidth * (416 / 264);
  const edgeX = Math.max(35, width * 0.07);
  const centerSideX = Math.max(edgeX + placardWidth * 1.6, width * 0.25);
  const placards: Array<readonly [number, number]> = [
    [edgeX, height * 0.10],
    [width - edgeX - placardWidth, height * 0.10],
    [centerSideX, height * 0.40],
    [width - centerSideX - placardWidth, height * 0.40],
    [edgeX, height - placardHeight - height * 0.08],
    [width - edgeX - placardWidth, height - placardHeight - height * 0.08],
  ];

  return baseSvg(
    width,
    height,
    `
      <defs>
        <pattern id="tsunamiHexes" width="188" height="164" patternUnits="userSpaceOnUse">
          <image href="${assets["warning_hex_red.png"]}" x="0" y="0" width="126" height="110"/>
          <image href="${assets["warning_hex_red.png"]}" x="94" y="82" width="126" height="110"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="#dc2c1f"/>
      <rect width="${width}" height="${height}" fill="url(#tsunamiHexes)" opacity=".95"/>

      ${placards
        .map(
          ([x, y], index) => `
            <g filter="url(#redGlow)" opacity="${index < 4 ? 1 : 0.96}">
              <rect x="${x - 8}" y="${y - 8}" width="${placardWidth + 16}" height="${placardHeight + 16}" rx="12" fill="#030303" stroke="#e60003" stroke-width="4"/>
              <image href="${assets["warning_tsunami_yellow.png"]}" x="${x}" y="${y}" width="${placardWidth}" height="${placardHeight}"/>
            </g>
          `,
        )
        .join("")}

      <g filter="url(#redGlow)">
        <image href="${assets["long_shape.svg"]}" x="${headerX}" y="${headerY}" width="${headerWidth}" height="${headerHeight}"/>
        <image href="${assets["warning_gempa_black.svg"]}" x="${headerX + headerWidth * 0.08}" y="${headerY + headerHeight * 0.23}" width="${headerHeight * 0.52}" height="${headerHeight * 0.52}"/>
        <image href="${assets["warning_gempa_black.svg"]}" x="${headerX + headerWidth * 0.82}" y="${headerY + headerHeight * 0.23}" width="${headerHeight * 0.52}" height="${headerHeight * 0.52}"/>
        <text x="${width / 2}" y="${headerY + headerHeight * 0.51}" text-anchor="middle" fill="#050505" class="label" font-size="${Math.max(25, headerHeight * 0.24)}">TSUNAMI</text>
        <text x="${width / 2}" y="${headerY + headerHeight * 0.73}" text-anchor="middle" fill="#050505" font-weight="700" font-size="${Math.max(13, headerHeight * 0.11)}">Peringatan Dini Tsunami</text>
      </g>

      <g filter="url(#redGlow)">
        <rect x="${dossierX}" y="${dossierY}" width="${dossierWidth}" height="${dossierHeight}" rx="8" fill="#030303" stroke="#e60003" stroke-width="5"/>
        <rect x="${dossierX}" y="${dossierY}" width="${dossierWidth}" height="15" fill="url(#hazard)"/>
        <rect x="${dossierX}" y="${dossierY + dossierHeight - 15}" width="${dossierWidth}" height="15" fill="url(#hazard)"/>
        <rect x="${dossierX}" y="${dossierY}" width="15" height="${dossierHeight}" fill="url(#hazard)"/>
        <rect x="${dossierX + dossierWidth - 15}" y="${dossierY}" width="15" height="${dossierHeight}" fill="url(#hazard)"/>

        <rect x="${dossierX + 34}" y="${dossierY + 32}" width="${dossierWidth - 68}" height="${Math.max(52, dossierHeight * 0.27)}" rx="6" fill="url(#hazard)" stroke="#e60003" stroke-width="4"/>
        <rect x="${dossierX + dossierWidth * 0.34}" y="${dossierY + 44}" width="${dossierWidth * 0.32}" height="${Math.max(28, dossierHeight * 0.13)}" fill="#030303"/>
        <text x="${width / 2}" y="${dossierY + Math.max(68, dossierHeight * 0.32)}" text-anchor="middle" class="red label" font-size="${Math.max(16, dossierWidth * 0.032)}">POTENSI TSUNAMI</text>

        <rect x="${dossierX + 34}" y="${dossierY + Math.max(98, dossierHeight * 0.42)}" width="${dossierWidth - 68}" height="${Math.max(42, dossierHeight * 0.22)}" fill="url(#hazard)"/>
        <rect x="${dossierX + dossierWidth * 0.42}" y="${dossierY + Math.max(105, dossierHeight * 0.45)}" width="${dossierWidth * 0.16}" height="${Math.max(27, dossierHeight * 0.14)}" fill="#030303"/>
        <text x="${width / 2}" y="${dossierY + Math.max(129, dossierHeight * 0.58)}" text-anchor="middle" class="white label" font-size="${Math.max(16, dossierWidth * 0.035)}">AWAS</text>

        <text x="${dossierX + 46}" y="${dossierY + dossierHeight * 0.76}" class="amber micro">CHANGE PROPAGATION TEST DETECTED.</text>
        <text x="${dossierX + 46}" y="${dossierY + dossierHeight * 0.86}" class="amber micro">VERIFY AFFECTED FILES AND TOOL ACTIONS.</text>
      </g>
      <rect x="${width * 0.02}" y="18" width="${Math.max(150, width * 0.17)}" height="30" fill="#030303" stroke="#e60003" stroke-width="3"/>
      <text x="${width * 0.027}" y="39" class="amber label" font-size="15">試験 / SIMULATION</text>
    `,
    assets,
  );
}

function healthyStatus(status: string): boolean {
  return ["ready", "complete", "online", "active", "playing", "success", "nominal", "clean"].some(
    (value) => status.toLowerCase().includes(value),
  );
}

function stationSvg(
  width: number,
  height: number,
  assets: AssetCatalog,
  stations: Station[],
  selectedIndex: number,
): string {
  const visibleStations =
    stations.length > 0
      ? stations.slice(0, 18)
      : [
          { id: "core", label: "CODEX CORE", detail: "SYSTEM", status: "STANDBY", trace: "", eventCount: 0 },
          { id: "shell", label: "SHELL-01", detail: "COMMAND", status: "STANDBY", trace: "", eventCount: 0 },
          { id: "workspace", label: "WORKSPACE", detail: "FILES", status: "STANDBY", trace: "", eventCount: 0 },
        ];
  const branchCount = Math.min(5, Math.max(3, Math.ceil(visibleStations.length / 4)));
  const itemsPerBranch = Math.ceil(visibleStations.length / branchCount);
  const branchWidth = width / branchCount;
  const headerHeight = Math.max(58, height * 0.11);
  const contentTop = headerHeight + 24;
  const contentBottom = height - 24;
  const bodyHeight = contentBottom - contentTop;
  const bladeWidth = Math.min(118, branchWidth * 0.38);
  const bladeHeight = Math.max(22, Math.min(34, bodyHeight / (itemsPerBranch + 2)));

  const branches = Array.from({ length: branchCount }, (_, branchIndex) => {
    const branchStations = visibleStations.slice(
      branchIndex * itemsPerBranch,
      (branchIndex + 1) * itemsPerBranch,
    );
    const spineX = branchWidth * (branchIndex + 0.5);
    const nodes = branchStations
      .map((station, localIndex) => {
        const globalIndex = branchIndex * itemsPerBranch + localIndex;
        const selected = globalIndex === selectedIndex;
        const left = localIndex % 2 === 0;
        const y =
          contentTop +
          ((localIndex + 1) * bodyHeight) / (Math.max(1, branchStations.length) + 1);
        const connector = Math.max(38, branchWidth * 0.22);
        const nodeX = left
          ? spineX - connector - bladeWidth
          : spineX + connector;
        const asset = healthyStatus(station.status)
          ? left
            ? assets["SkewRectangle_Green.svg"]
            : assets["SkewRectangle_Green_Flip.svg"]
          : left
            ? assets["SkewRectangle_Red.svg"]
            : assets["SkewRectangle_Red_Flip.svg"];
        const rotation = left ? -18 : 18;
        const labelX = left ? spineX - connector + 5 : spineX + connector - 5;
        const anchor = "end";
        const selectedOutline = selected
          ? `<rect x="${nodeX - 7}" y="${y - bladeHeight / 2 - 7}" width="${bladeWidth + 14}" height="${bladeHeight + 14}" fill="none" stroke="#fcae16" stroke-width="4" filter="url(#amberGlow)"/>`
          : "";
        return `
          <line x1="${spineX}" y1="${y}" x2="${left ? spineX - connector : spineX + connector}" y2="${y}" stroke="#fc8416" stroke-width="3"/>
          <g transform="translate(${nodeX} ${y - bladeHeight / 2}) rotate(${rotation} ${bladeWidth / 2} ${bladeHeight / 2})">
            <image href="${asset}" width="${bladeWidth}" height="${bladeHeight}" preserveAspectRatio="none"/>
          </g>
          ${selectedOutline}
          <text x="${labelX}" y="${y + 16}" text-anchor="${anchor}" class="amber label" font-size="${Math.max(11, bladeHeight * 0.42)}">${xml(short(station.label, 15))}</text>
        `;
      })
      .join("");
    return `
      <line x1="${spineX}" y1="${contentTop - 8}" x2="${spineX}" y2="${contentBottom}" stroke="#fc8416" stroke-width="5"/>
      ${nodes}
    `;
  }).join("");

  return baseSvg(
    width,
    height,
    `
      <rect x="4" y="5" width="${width - 8}" height="${headerHeight - 10}" rx="8" fill="url(#hazard)" stroke="#fcae16" stroke-width="4"/>
      <rect x="${width * 0.38}" y="${headerHeight * 0.25}" width="${width * 0.24}" height="${headerHeight * 0.48}" fill="#030303"/>
      <text x="${width / 2}" y="${headerHeight * 0.61}" text-anchor="middle" class="amber label" font-size="${Math.max(20, headerHeight * 0.38)}">STATION STATUS</text>
      ${branches}
      <text x="${width - 18}" y="${height - 8}" text-anchor="end" class="amber micro">${visibleStations.length.toString().padStart(2, "0")} FUNCTIONAL NODES · ↑/↓ INSPECT</text>
    `,
    assets,
  );
}

async function renderGraphicPngUncached(
  options: GraphicCompositionOptions,
): Promise<Buffer> {
  const assets = await loadCatalog();
  const columns = Math.max(24, Math.floor(options.columns));
  const rows = Math.max(6, Math.floor(options.rows));
  const width = Math.max(720, Math.min(1600, columns * 14));
  const targetAspect = columns / (rows * 2);
  const height = Math.max(430, Math.min(980, Math.round(width / targetAspect)));
  const svg =
    options.scene === "earthquake"
      ? earthquakeSvg(
          width,
          height,
          assets,
          options.incidentDetail ?? "Fixture command failure detected in the simulated execution layer.",
          options.simulation ?? true,
        )
      : options.scene === "tsunami"
        ? tsunamiSvg(width, height, assets)
        : stationSvg(
            width,
            height,
            assets,
            options.stations ?? [],
            options.selectedIndex ?? 0,
          );

  const { default: sharp } = await import("sharp");
  return sharp(Buffer.from(svg), { density: 72 })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export function renderGraphicPng(
  options: GraphicCompositionOptions,
): Promise<Buffer> {
  const stationKey = (options.stations ?? [])
    .map((station) =>
      [station.id, station.label, station.status, station.eventCount].join(":"),
    )
    .join("|");
  const key = [
    options.scene,
    Math.floor(options.columns),
    Math.floor(options.rows),
    options.selectedIndex ?? 0,
    options.simulation ?? true,
    options.incidentDetail ?? "",
    stationKey,
  ].join("::");
  const cached = renderCache.get(key);
  if (cached) return cached;

  const rendered = renderGraphicPngUncached(options).catch((error: unknown) => {
    renderCache.delete(key);
    throw error;
  });
  renderCache.set(key, rendered);
  if (renderCache.size > 16) {
    const oldest = renderCache.keys().next().value as string | undefined;
    if (oldest) renderCache.delete(oldest);
  }
  return rendered;
}
