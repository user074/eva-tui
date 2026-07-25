import type { AppState } from "../state/model.js";
import type { Station } from "./operations-model.js";
import { shortLabel } from "./operations-model.js";
import { statusColor, theme } from "./theme.js";
import { TuiFrame, truncateTuiText, tuiTextWidth } from "./tui-frame.js";
import {
  drawAlertPlacard,
  drawBrailleWaveform,
  drawDossier,
  drawFilledRectPanel,
  drawHazardRail,
  drawRectStatusBlock,
  drawWarningField,
} from "./tui-primitives.js";

export interface EarthquakeFrameOptions {
  columns: number;
  rows: number;
  phase: number;
  motionPhase?: number;
  synchronizationPercent?: number;
  incidentDetail: string;
  simulation: boolean;
}

export interface TsunamiFrameOptions {
  columns: number;
  rows: number;
  phase: number;
  motionPhase?: number;
  state?: AppState | undefined;
}

export interface StationFrameOptions {
  columns: number;
  rows: number;
  phase: number;
  motionPhase?: number;
  stations: Station[];
  selectedIndex: number;
}

export interface SynchronizationFrameOptions {
  columns: number;
  rows: number;
  phase: number;
  percent: number;
  status: string;
  detail: string;
}

export function buildSynchronizationFrame(
  options: SynchronizationFrameOptions,
): TuiFrame {
  const frame = new TuiFrame(options.columns, options.rows, {
    background: theme.black,
  });
  const label = truncateTuiText(
    `HUMAN↔CODEX // ${options.status} // ${options.detail}`,
    frame.width,
  );
  frame.text(0, 0, label, {
    color: options.status === "LINK DECAY" ? theme.red : theme.dim,
    bold: options.status === "LINK DECAY",
  });
  if (frame.height > 1) {
    const baselineY = 1 + Math.floor((frame.height - 2) / 2);
    frame.hLine(0, baselineY, frame.width, "·", {
      color: theme.dim,
      dim: true,
    });
    drawBrailleWaveform(
      frame,
      0,
      1,
      frame.width,
      frame.height - 1,
      options.phase,
      theme.cyan,
      options.percent,
    );
  }
  return frame;
}

function pulseTone(phase: number): string {
  return phase % 8 < 4 ? theme.red : theme.amber;
}

function statusCode(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error")) return "ERR";
  if (normalized.includes("run") || normalized.includes("active")) return "ACT";
  if (
    normalized.includes("ready") ||
    normalized.includes("complete") ||
    normalized.includes("online") ||
    normalized.includes("nominal") ||
    normalized.includes("clean")
  ) {
    return "OK";
  }
  return "---";
}

function drawEarthquakeSummary(
  frame: TuiFrame,
  y: number,
  options: EarthquakeFrameOptions,
): void {
  const tone = options.simulation ? theme.amber : theme.red;
  const label = options.simulation ? "TEST INCIDENT DOSSIER" : "FAILURE DOSSIER";
  const motionPhase = options.motionPhase ?? options.phase;
  const synchronizationPercent = Math.max(
    0,
    Math.min(100, options.synchronizationPercent ?? 0),
  );
  const displayedSynchronization = Math.round(synchronizationPercent);
  if (frame.height >= 27 && y + 8 <= frame.height - 2) {
    const width = Math.min(70, frame.width - 24);
    const x = Math.floor((frame.width - width) / 2);
    const height = Math.max(
      8,
      Math.min(10, frame.height - y - 2),
    );
    const inner = drawDossier(frame, {
      x,
      y,
      width,
      height,
      title: label,
      border: tone,
      phase: motionPhase,
    });
    const incidentMode = options.simulation
      ? "SIMULATION / NO ACTION"
      : "ACTIVE TURN FAILURE";
    frame.centeredText(
      inner.y,
      truncateTuiText(
        `${incidentMode} // ${options.incidentDetail}`,
        inner.width,
      ),
      { color: theme.white },
      inner.x,
      inner.width,
    );
    const scopeLabel =
      `SYNC ${displayedSynchronization.toString().padStart(3, "0")}%`;
    frame.text(inner.x, inner.y + 1, scopeLabel, {
      color: theme.dim,
      bold: true,
    });
    drawBrailleWaveform(
      frame,
      inner.x + scopeLabel.length + 2,
      inner.y + 1,
      inner.width - scopeLabel.length - 2,
      Math.max(1, inner.height - 1),
      motionPhase,
      theme.cyan,
      synchronizationPercent,
    );
    return;
  }

  if (y < frame.height - 3) {
    frame.centeredText(
      y,
      ` ${truncateTuiText(options.incidentDetail, frame.width - 8)} `,
      { color: theme.white, background: theme.crimson, bold: true },
    );
    if (y + 1 < frame.height - 2) {
      const scopeLabel =
        `SYNC ${displayedSynchronization.toString().padStart(3, "0")}%`;
      frame.text(2, y + 1, scopeLabel, { color: theme.dim, bold: true });
      drawBrailleWaveform(
        frame,
        scopeLabel.length + 4,
        y + 1,
        frame.width - scopeLabel.length - 6,
        1,
        motionPhase,
        theme.cyan,
        synchronizationPercent,
      );
    }
  }
}

export function buildEarthquakeFrame(
  options: EarthquakeFrameOptions,
): TuiFrame {
  const frame = new TuiFrame(options.columns, options.rows, {
    background: theme.black,
  });
  const motionPhase = options.motionPhase ?? options.phase;
  const tone = pulseTone(motionPhase);
  const compact = frame.width < 82 || frame.height < 25;
  const spacious = !compact && frame.height >= 27;
  drawHazardRail(frame, 0, "EARTHQUAKE // 地震", motionPhase, theme.orange);
  drawHazardRail(
    frame,
    frame.height - 2,
    "EARTHQUAKE // 地震",
    motionPhase + 4,
    theme.orange,
    true,
  );

  const headerY = 3;
  const headerHeight = 6;
  const sideReserve = compact ? 4 : 34;
  const headerWidth = Math.min(46, Math.max(32, frame.width - sideReserve));
  const headerX = Math.floor((frame.width - headerWidth) / 2);
  drawFilledRectPanel(frame, {
    x: headerX,
    y: headerY,
    width: headerWidth,
    height: headerHeight,
    tag: options.simulation ? "TEST EVENT / 試験" : "SYSTEM EVENT / 緊急",
    title: "WARNING / GEMPA BUMI",
    subtitle: "EARTHQUAKE DETECTED",
    fill: theme.red,
    border: theme.black,
    text: theme.black,
    railInset: 5,
  });

  if (!compact) {
    const warningWidth = 13;
    drawFilledRectPanel(frame, {
      x: headerX - warningWidth - 2,
      y: headerY,
      width: warningWidth,
      height: headerHeight,
      title: "WARNING",
      subtitle: "▲",
      border: theme.black,
      fill: theme.amber,
      text: theme.black,
      railInset: 2,
    });
    drawFilledRectPanel(frame, {
      x: headerX + headerWidth + 2,
      y: headerY,
      width: warningWidth,
      height: headerHeight,
      title: "WARNING",
      subtitle: "▲",
      border: theme.black,
      fill: theme.amber,
      text: theme.black,
      railInset: 2,
    });
  }

  const dataY = compact ? 9 : 10;
  const moduleHeight = 6;
  const sidePlacardWidth = compact ? 0 : 12;
  const groupAvailable = frame.width - (compact ? 4 : sidePlacardWidth * 2 + 8);
  const gap = 1;
  const moduleWidth = Math.max(
    12,
    Math.min(spacious ? 15 : 14, Math.floor((groupAvailable - gap * 2) / 3)),
  );
  const groupWidth = moduleWidth * 3 + gap * 2;
  const groupX = Math.floor((frame.width - groupWidth) / 2);
  const connectorY = dataY + Math.floor(moduleHeight / 2);

  frame.hLine(groupX + moduleWidth - 1, connectorY, gap + 2, "━", {
    color: theme.orange,
  });
  frame.hLine(
    groupX + moduleWidth * 2 + gap - 1,
    connectorY,
    gap + 2,
    "━",
    { color: theme.orange },
  );
  frame.vLine(
    groupX + moduleWidth + gap + Math.floor(moduleWidth / 2),
    connectorY,
    Math.max(2, Math.floor(moduleHeight / 2)),
    "┃",
    { color: theme.red },
  );

  drawFilledRectPanel(frame, {
    x: groupX,
    y: dataY,
    width: moduleWidth,
    height: moduleHeight,
    title: "MAGNITUDE",
    subtitle: options.simulation ? "6.2 TEST" : "FAILURE",
    border: theme.black,
    fill: theme.red,
    text: theme.black,
    railInset: 2,
  });
  drawFilledRectPanel(frame, {
    x: groupX + moduleWidth + gap,
    y: dataY + 1,
    width: moduleWidth,
    height: moduleHeight,
    title: "SYNC LINK",
    subtitle: options.simulation ? "FIXTURE" : "LOCKED",
    border: theme.black,
    fill: theme.amber,
    text: theme.black,
    railInset: 2,
  });
  drawFilledRectPanel(frame, {
    x: groupX + (moduleWidth + gap) * 2,
    y: dataY,
    width: moduleWidth,
    height: moduleHeight,
    title: "DEPTH",
    subtitle: options.simulation ? "10 KM" : "TURN CORE",
    border: theme.black,
    fill: theme.red,
    text: theme.black,
    railInset: 2,
  });

  if (!compact && frame.height >= 25) {
    drawAlertPlacard(
      frame,
      1,
      dataY,
      sidePlacardWidth,
      "地震",
      "GEMPA",
      motionPhase,
      theme.red,
      theme.amber,
    );
    drawAlertPlacard(
      frame,
      frame.width - sidePlacardWidth - 1,
      dataY,
      sidePlacardWidth,
      "地震",
      "BUMI",
      motionPhase + 3,
      theme.red,
      theme.amber,
    );
  }

  drawEarthquakeSummary(frame, compact ? dataY + 8 : 17, options);
  return frame;
}

function tsunamiStats(state: AppState | undefined): {
  files: number;
  additions: number;
  deletions: number;
  label: string;
} {
  if (!state) {
    return {
      files: 6,
      additions: 240,
      deletions: 32,
      label: "PACIFIC FIXTURE GRID",
    };
  }
  return {
    files: state.diff.files.length || 6,
    additions: state.diff.additions,
    deletions: state.diff.deletions,
    label:
      state.diff.files.length > 0
        ? shortLabel(state.diff.files[0] ?? "WORKSPACE DELTA", 38)
        : "PACIFIC FIXTURE GRID",
  };
}

export function buildTsunamiFrame(options: TsunamiFrameOptions): TuiFrame {
  const frame = new TuiFrame(options.columns, options.rows, {
    background: theme.black,
  });
  const stats = tsunamiStats(options.state);
  const motionPhase = options.motionPhase ?? options.phase;
  const compact = frame.width < 88 || frame.height < 24;
  const placardWidth = compact ? 0 : Math.min(13, Math.floor(frame.width * 0.14));
  const centerMargin = compact ? 3 : placardWidth + 8;
  const headerWidth = Math.max(38, frame.width - centerMargin * 2);
  const headerX = Math.floor((frame.width - headerWidth) / 2);

  drawWarningField(frame, motionPhase, theme.crimson, options.phase);
  drawFilledRectPanel(frame, {
    x: headerX,
    y: 1,
    width: headerWidth,
    height: 5,
    tag: "TSUNAMI / 津波",
    title: "PERINGATAN DINI TSUNAMI",
    subtitle: "EARLY WARNING SYSTEM",
    fill: theme.red,
    border: theme.black,
    text: theme.black,
    railInset: 5,
  });

  const dossierY = compact ? 7 : 8;
  const dossierWidth = compact
    ? frame.width - 6
    : Math.max(44, frame.width - (placardWidth + 8) * 2);
  const dossierHeight = Math.max(10, frame.height - dossierY - 2);
  const dossierX = Math.floor((frame.width - dossierWidth) / 2);
  const inner = drawDossier(frame, {
    x: dossierX,
    y: dossierY,
    width: dossierWidth,
    height: dossierHeight,
    title: "POTENSI TSUNAMI / CHANGE PROPAGATION",
    border: theme.red,
    phase: motionPhase,
  });

  frame.centeredText(inner.y, "STATUS LEVEL", {
    color: theme.dim,
    bold: true,
  }, inner.x, inner.width);
  frame.centeredText(inner.y + 1, " AWAS / CRITICAL ", {
    color: theme.black,
    background: theme.red,
    bold: true,
  }, inner.x, inner.width);
  if (inner.height >= 5) {
    frame.centeredText(
      inner.y + 3,
      truncateTuiText(stats.label.toUpperCase(), inner.width),
      { color: theme.white, bold: true },
      inner.x,
      inner.width,
    );
  }
  if (inner.height >= 7) {
    frame.centeredText(
      inner.y + 5,
      `${String(stats.files).padStart(2, "0")} NODES  //  +${stats.additions}  -${stats.deletions}`,
      { color: theme.amber, bold: true },
      inner.x,
      inner.width,
    );
  }
  if (inner.height >= 8) {
    const waveWidth = Math.max(8, Math.min(inner.width - 18, 30));
    const active = 1 + (motionPhase % waveWidth);
    const signal = `${"━".repeat(active)}${"─".repeat(waveWidth - active)}`;
    frame.centeredText(
      inner.y + 7,
      `PROPAGATION ${signal}`,
      { color: theme.red, bold: true, blink: true },
      inner.x,
      inner.width,
    );
  }
  if (inner.height >= 11) {
    frame.centeredText(
      inner.y + 9,
      "SIMULATION ONLY  //  NO WORKSPACE ACTION",
      { color: theme.dim },
      inner.x,
      inner.width,
    );
  }
  if (inner.height >= 14) {
    const channels = [
      ["NODE-01", "FILE DELTA", theme.red],
      ["NODE-02", "TOOL BUS", theme.amber],
      ["NODE-03", "VERIFY LINK", theme.green],
    ] as const;
    channels.forEach(([node, label, color], index) => {
      const progressWidth = Math.max(6, Math.min(18, inner.width - 26));
      const filled = Math.max(
        1,
        Math.min(progressWidth, progressWidth - index * 4 + (options.phase % 3)),
      );
      const progress = `${"━".repeat(filled)}${"─".repeat(progressWidth - filled)}`;
      frame.centeredText(
        inner.y + 11 + index,
        `${node} ${progress} ${label}`,
        { color, bold: index === 0 },
        inner.x,
        inner.width,
      );
    });
  }

  if (!compact) {
    const placardX = [1, frame.width - placardWidth - 1] as const;
    const placardY = [
      1,
      Math.max(8, Math.floor((frame.height - 7) / 2)),
      Math.max(1, frame.height - 8),
    ];
    for (const [row, y] of placardY.entries()) {
      for (const [side, x] of placardX.entries()) {
        drawAlertPlacard(
          frame,
          x,
          y,
          placardWidth,
          "津波",
          `ZONE ${row * 2 + side + 1}`,
          motionPhase + row * 2 + side,
          theme.red,
        );
      }
    }
  }
  return frame;
}

function distributeStations(stations: Station[], columns: number): Station[][] {
  const branchCount =
    columns >= 124 ? 5 : columns >= 94 ? 4 : columns >= 68 ? 3 : 2;
  const groups: Station[][] = Array.from({ length: branchCount }, () => []);
  stations.forEach((station, index) => {
    groups[index % branchCount]?.push(station);
  });
  return groups;
}

function drawStationNode(
  frame: TuiFrame,
  station: Station,
  index: number,
  selected: boolean,
  laneX: number,
  laneWidth: number,
  spineX: number,
  y: number,
  phase: number,
): void {
  const side = index % 2 === 0 ? -1 : 1;
  const color = statusColor(station.status);
  const halfLane = Math.max(5, Math.floor(laneWidth / 2) - 1);
  const blockWidth = Math.max(6, Math.min(9, halfLane - 2));
  const arm = Math.max(2, halfLane - blockWidth);
  const labelWidth = Math.max(4, halfLane);
  const label = truncateTuiText(station.label.toUpperCase(), labelWidth);
  const blockTone = color;

  frame.put(spineX, y, selected ? "◆" : side < 0 ? "┫" : "┣", {
    color: selected ? theme.white : theme.orange,
    bold: true,
    blink: selected,
  });
  if (side < 0) {
    const blockX = spineX - arm - blockWidth;
    const connectorX = blockX + blockWidth - 1;
    frame.hLine(connectorX, y, spineX - connectorX, "━", {
      color: selected ? theme.white : color,
    });
    frame.put(connectorX, y, selected ? "◆" : "◇", {
      color: selected ? theme.white : color,
      bold: true,
      blink: selected,
    });
    drawRectStatusBlock(
      frame,
      blockX,
      y - 1,
      blockWidth,
      2,
      -1,
      blockTone,
      selected ? theme.white : theme.amber,
    );
    const labelX = Math.max(laneX, spineX - tuiTextWidth(label));
    frame.text(labelX, y + 1, label, {
      color: selected ? theme.white : color,
      dim: !selected,
      bold: selected,
    });
  } else {
    const blockX = spineX + arm + 1;
    frame.hLine(spineX + 1, y, blockX - spineX, "━", {
      color: selected ? theme.white : color,
    });
    frame.put(blockX, y, selected ? "◆" : "◇", {
      color: selected ? theme.white : color,
      bold: true,
      blink: selected,
    });
    drawRectStatusBlock(
      frame,
      blockX,
      y - 1,
      blockWidth,
      2,
      1,
      blockTone,
      selected ? theme.white : theme.amber,
    );
    frame.text(spineX + 1, y + 1, label, {
      color: selected ? theme.white : color,
      dim: !selected,
      bold: selected,
    });
  }

  if (selected && phase % 6 < 3) {
    frame.put(side < 0 ? laneX : laneX + laneWidth - 1, y, side < 0 ? "▶" : "◀", {
      color: theme.white,
      bold: true,
      blink: true,
    });
  }

  if (y + 2 < frame.height) {
    const code = `[${statusCode(station.status)} ${String(station.eventCount).padStart(2, "0")}]`;
    const codeWidth = tuiTextWidth(code);
    frame.text(
      side < 0 ? Math.max(laneX, spineX - codeWidth) : spineX + 1,
      y + 2,
      code,
      { color, dim: !selected, bold: selected },
    );
  }
}

export function buildStationFrame(options: StationFrameOptions): TuiFrame {
  const frame = new TuiFrame(options.columns, options.rows, {
    background: theme.black,
  });
  const groups = distributeStations(options.stations, frame.width);
  const motionPhase = options.motionPhase ?? options.phase;
  const laneWidth = Math.floor(frame.width / groups.length);

  for (let y = 2; y < frame.height; y += 4) {
    frame.hLine(0, y, frame.width, "┄", {
      color: theme.crimson,
      dim: true,
    });
  }

  groups.forEach((stations, branchIndex) => {
    const laneX = branchIndex * laneWidth;
    const actualWidth =
      branchIndex === groups.length - 1 ? frame.width - laneX : laneWidth;
    const spineX = laneX + Math.floor(actualWidth / 2);
    const top = 1;
    const bottom = Math.max(top + 2, frame.height - 2);
    frame.vLine(spineX, top, bottom - top + 1, "┃", {
      color: theme.orange,
    });
    frame.put(spineX, top, "▼", {
      color: theme.orange,
      bold: true,
    });
    frame.put(spineX, bottom, "◆", {
      color: theme.orange,
      bold: true,
    });
    frame.centeredText(
      0,
      `RIB-${String(branchIndex + 1).padStart(2, "0")}`,
      { color: theme.orange, bold: true },
      laneX,
      actualWidth,
    );

    stations.forEach((station, localIndex) => {
      const globalIndex = options.stations.indexOf(station);
      const y =
        stations.length === 1
          ? Math.floor((top + bottom) / 2)
          : Math.round(
              top +
                2 +
                (localIndex * Math.max(1, bottom - top - 4)) /
                  Math.max(1, stations.length - 1),
            );
      drawStationNode(
        frame,
        station,
        localIndex,
        globalIndex === options.selectedIndex,
        laneX,
        actualWidth,
        spineX,
        y,
        motionPhase,
      );
    });
  });

  if (options.stations.length === 0) {
    frame.centeredText(
      Math.floor(frame.height / 2),
      "NO STATION TELEMETRY",
      { color: theme.dim, bold: true },
    );
  }
  return frame;
}
