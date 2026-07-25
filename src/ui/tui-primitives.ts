import { theme } from "./theme.js";
import {
  TuiFrame,
  truncateTuiText,
  tuiTextWidth,
} from "./tui-frame.js";
import {
  drawAssetDataHex,
  drawAssetLongHex,
  drawAssetSkewBlade,
  drawAssetWarningHex,
} from "./asset-cell-masks.js";

export interface PanelOptions {
  x: number;
  y: number;
  width: number;
  height?: number;
  title: string;
  subtitle?: string;
  tag?: string;
  fill?: string;
  border?: string;
  text?: string;
}

function repeatToWidth(pattern: string, width: number, offset = 0): string {
  const characters = Array.from(pattern);
  if (characters.length === 0) return " ".repeat(width);
  return Array.from(
    { length: Math.max(0, width) },
    (_, index) => characters[(index + offset) % characters.length] ?? " ",
  ).join("");
}

function blendHexColor(from: string, to: string, progress: number): string {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped === 0) return from;
  if (clamped === 1) return to;
  const parse = (color: string): [number, number, number] => {
    const value = color.slice(1);
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ];
  };
  const start = parse(from);
  const end = parse(to);
  return `#${start
    .map((channel, index) =>
      Math.round(channel + ((end[index] ?? channel) - channel) * clamped)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function denseDiagonalStripe(
  width: number,
  offset = 0,
  inverted = false,
): string {
  return repeatToWidth(
    inverted ? "◣◥" : "◢◤",
    Math.max(0, Math.floor(width)),
    offset,
  );
}

export function drawVerticalTriangle(
  frame: TuiFrame,
  centerX: number,
  y: number,
  height: number,
  direction: "up" | "down",
  tone: string,
  background?: string,
  blink = false,
): void {
  const h = Math.max(1, Math.floor(height));
  for (let row = 0; row < h; row += 1) {
    const level = direction === "up" ? row : h - row - 1;
    const width = (level + 1) * 2;
    const left = Math.floor(centerX - width / 2);
    const edge =
      direction === "up"
        ? ["◢", "◣"] as const
        : ["◥", "◤"] as const;
    frame.text(
      left,
      y + row,
      `${edge[0]}${"▇".repeat(Math.max(0, width - 2))}${edge[1]}`,
      {
        color: tone,
        ...(background ? { background } : {}),
        bold: true,
        blink,
      },
    );
  }
}

export function drawHorizontalTriangle(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  direction: "left" | "right",
  edge: string,
  fill: string = edge,
): void {
  const w = Math.max(2, Math.floor(width));
  const h = Math.max(3, Math.floor(height));
  const middle = Math.floor(h / 2);
  for (let row = 0; row < h; row += 1) {
    const inset = Math.min(w - 1, Math.abs(middle - row));
    if (direction === "left") {
      const boundary = x + inset;
      frame.fill(boundary + 1, y + row, w - inset - 1, 1, " ", {
        background: fill,
      });
      frame.put(
        boundary,
        y + row,
        row < middle ? "◢" : row > middle ? "◥" : "◀",
        { color: edge, bold: true },
      );
    } else {
      const boundary = x + w - inset - 1;
      frame.fill(x, y + row, w - inset - 1, 1, " ", {
        background: fill,
      });
      frame.put(
        boundary,
        y + row,
        row < middle ? "◣" : row > middle ? "◤" : "▶",
        { color: edge, bold: true },
      );
    }
  }
}

export function drawBrailleWaveform(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  phase: number,
  tone: string = theme.cyan,
  synchronizationPercent = 100,
): void {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const pixelWidth = w * 2;
  const pixelHeight = h * 4;
  const traceCount = h === 1 ? 2 : 3;
  const synchronization = Math.max(
    0,
    Math.min(100, synchronizationPercent),
  ) / 100;
  // Terminal cells make nearby traces merge sooner than vector lines. Ease the
  // spread so the middle of the 0–100 range remains visually distinguishable.
  const dispersion = Math.pow(1 - synchronization, 1.8);
  const palette = [
    tone,
    theme.purple,
    theme.red,
    theme.amber,
    theme.purple,
    theme.cyan,
    theme.red,
  ];
  const fullTraceProfiles = [
    { phase: -1.65, frequency: 0.72, amplitude: 0.34, bias: -0.16 },
    { phase: -0.7, frequency: 0.88, amplitude: 0.47, bias: 0.1 },
    { phase: 0.15, frequency: 1.03, amplitude: 0.58, bias: -0.04 },
    { phase: 1, frequency: 1.19, amplitude: 0.4, bias: 0.15 },
    { phase: 2, frequency: 1.36, amplitude: 0.52, bias: -0.1 },
  ] as const;
  const traceProfiles =
    traceCount === 2
      ? [
          fullTraceProfiles[0],
          fullTraceProfiles[4],
        ]
      : [
          fullTraceProfiles[0],
          fullTraceProfiles[2],
          fullTraceProfiles[4],
        ];
  const cells = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({
      mask: 0,
      hits: 0,
      color: tone,
    })),
  );
  const dotBits = [
    [0, 3],
    [1, 4],
    [2, 5],
    [6, 7],
  ] as const;

  for (let traceIndex = 0; traceIndex < traceCount; traceIndex += 1) {
    const masks = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => 0),
    );
    const setDot = (pixelX: number, pixelY: number): void => {
      if (
        pixelX < 0 ||
        pixelX >= pixelWidth ||
        pixelY < 0 ||
        pixelY >= pixelHeight
      ) {
        return;
      }
      const cellX = Math.floor(pixelX / 2);
      const cellY = Math.floor(pixelY / 4);
      const bit = dotBits[pixelY % 4]?.[pixelX % 2];
      if (bit === undefined) return;
      const row = masks[cellY];
      if (!row) return;
      row[cellX] = (row[cellX] ?? 0) | (1 << bit);
    };
    const connect = (
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
    ): void => {
      let currentX = fromX;
      let currentY = fromY;
      const deltaX = Math.abs(toX - fromX);
      const deltaY = Math.abs(toY - fromY);
      const stepX = fromX < toX ? 1 : -1;
      const stepY = fromY < toY ? 1 : -1;
      let error = deltaX - deltaY;
      while (true) {
        setDot(currentX, currentY);
        if (currentX === toX && currentY === toY) break;
        const doubledError = error * 2;
        if (doubledError > -deltaY) {
          error -= deltaY;
          currentX += stepX;
        }
        if (doubledError < deltaX) {
          error += deltaX;
          currentY += stepY;
        }
      }
    };

    const profile = traceProfiles[traceIndex] ?? fullTraceProfiles[2];
    // Every trace remains a single pure sine line. Synchronization only pulls
    // its smooth phase, frequency, amplitude, and baseline offsets toward the
    // shared carrier; it never adds noise or point-wise distortion.
    const phaseOffset = profile.phase * dispersion;
    const frequency =
      0.27 * (1 + (profile.frequency - 1) * dispersion);
    const amplitude =
      0.5 + (profile.amplitude - 0.5) * dispersion;
    const verticalBias = profile.bias * dispersion;
    let previousY = Math.floor(pixelHeight / 2);
    for (let pixelX = 0; pixelX < pixelWidth; pixelX += 1) {
      const carrier = Math.sin(
        pixelX * frequency + phase * 0.58 + phaseOffset,
      ) * amplitude;
      const value = Math.max(
        -1,
        Math.min(1, carrier + verticalBias),
      );
      const pixelY = Math.round(
        ((1 - value) / 2) * Math.max(0, pixelHeight - 1),
      );
      if (pixelX === 0) {
        setDot(pixelX, pixelY);
      } else {
        connect(pixelX - 1, previousY, pixelX, pixelY);
      }
      previousY = pixelY;
    }

    masks.forEach((row, cellY) => {
      row.forEach((mask, cellX) => {
        if (mask === 0) return;
        const cell = cells[cellY]?.[cellX];
        if (!cell) return;
        cell.mask |= mask;
        cell.hits += 1;
        cell.color = palette[traceIndex % palette.length] ?? tone;
      });
    });
  }

  cells.forEach((row, cellY) => {
    row.forEach((cell, cellX) => {
      if (cell.mask === 0) return;
      const overlapColor =
        cell.hits >= Math.ceil(traceCount * 0.65)
          ? theme.white
          : cell.hits >= 2
            ? theme.purple
            : cell.color;
      frame.put(
        left + cellX,
        top + cellY,
        String.fromCodePoint(0x2800 + cell.mask),
        {
          color: overlapColor,
          background: theme.black,
          bold: true,
        },
      );
    });
  });
}

function drawHorizontalHexSurface(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  edge: string,
): void {
  if (fill === theme.black) {
    drawAssetWarningHex(frame, x, y, width, height, edge);
  } else {
    drawAssetDataHex(frame, x, y, width, height, fill);
  }
}

export function drawHazardRail(
  frame: TuiFrame,
  y: number,
  label: string,
  phase: number,
  tone: string = theme.red,
  inverted = false,
): void {
  if (y < 0 || y + 1 >= frame.height) return;
  const offset = Math.floor(phase / 2) % 2;
  const stripe = denseDiagonalStripe(frame.width, offset, inverted);
  const repeatedLabel = repeatToWidth(
    `  ${label.toUpperCase()}  //  `,
    frame.width,
    Math.floor(phase / 8),
  );
  const stripeStyle = {
    color: tone,
    background: theme.black,
    bold: true,
    blink: true,
  } as const;
  const labelStyle = {
    color: tone,
    background: theme.black,
    bold: true,
  } as const;
  if (inverted) {
    frame.text(0, y, stripe, stripeStyle);
    frame.text(0, y + 1, repeatedLabel, labelStyle);
  } else {
    frame.text(0, y, repeatedLabel, labelStyle);
    frame.text(0, y + 1, stripe, stripeStyle);
  }
}

export function drawFilledRectPanel(
  frame: TuiFrame,
  options: PanelOptions & { railInset?: number },
): void {
  const x = Math.floor(options.x);
  const y = Math.floor(options.y);
  const width = Math.max(8, Math.floor(options.width));
  const height = Math.max(3, Math.floor(options.height ?? 5));
  const fill = options.fill ?? theme.red;
  const rail = options.border ?? theme.black;
  const text = options.text ?? theme.black;
  const maximumInset = Math.max(1, Math.floor((width - 3) / 2));
  const railInset = Math.min(
    maximumInset,
    Math.max(1, Math.floor(options.railInset ?? 3)),
  );

  frame.fill(x, y, width, height, " ", {
    color: fill,
    background: fill,
  });
  frame.hLine(x + railInset, y, width - railInset * 2, "━", {
    color: rail,
    background: fill,
    bold: true,
  });
  frame.hLine(x + railInset, y + height - 1, width - railInset * 2, "━", {
    color: rail,
    background: fill,
    bold: true,
  });

  const lines = [options.tag, options.title, options.subtitle].filter(
    (line): line is string => Boolean(line),
  );
  const firstRow = y + Math.max(1, Math.floor((height - lines.length) / 2));
  lines.forEach((line, index) => {
    frame.centeredText(
      Math.min(y + height - 2, firstRow + index),
      truncateTuiText(line, width - 4),
      {
        color: text,
        background: fill,
        bold: index < 2,
      },
      x,
      width,
    );
  });
}

export function drawRectStatusBlock(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  direction: -1 | 1,
  tone: string,
  accent: string = theme.amber,
): void {
  const w = Math.max(4, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const left = Math.floor(x);
  const top = Math.floor(y);
  const accentWidth = Math.max(1, Math.min(w, Math.round(w * (168.5 / 500))));
  const accentX = direction < 0 ? left : left + w - accentWidth;
  const railX = direction < 0 ? accentX + accentWidth : left;
  const railWidth = w - accentWidth;

  frame.fill(left, top, w, h, " ", {
    color: tone,
    background: tone,
  });
  frame.fill(accentX, top, accentWidth, h, " ", {
    color: accent,
    background: accent,
  });
  if (railWidth > 0) {
    frame.hLine(railX, top, railWidth, "━", {
      color: theme.black,
      background: tone,
      bold: true,
    });
  }
}

export function drawLongHex(frame: TuiFrame, options: PanelOptions): void {
  const height = Math.max(3, Math.min(7, options.height ?? 5));
  const width = Math.max(12, Math.floor(options.width));
  const x = Math.floor(options.x);
  const y = Math.floor(options.y);
  const middle = Math.floor(height / 2);
  const fill = options.fill ?? theme.red;
  const border = options.border ?? theme.amber;
  const text = options.text ?? theme.black;

  drawAssetLongHex(frame, x, y, width, height, fill);

  if (options.tag && height >= 5) {
    frame.centeredText(
      y + Math.max(0, middle - 1),
      truncateTuiText(options.tag, width - 6),
      { color: text, bold: true },
      x,
      width,
    );
  }
  frame.centeredText(
    y + middle,
    truncateTuiText(options.title, width - 4),
    { color: text, bold: true },
    x,
    width,
  );
  if (options.subtitle && height >= 5) {
    frame.centeredText(
      y + Math.min(height - 1, middle + 1),
      truncateTuiText(options.subtitle, width - 6),
      { color: text },
      x,
      width,
    );
  }
}

export function drawHexModule(frame: TuiFrame, options: PanelOptions): void {
  const x = Math.floor(options.x);
  const y = Math.floor(options.y);
  const width = Math.max(10, Math.floor(options.width));
  const height = Math.max(5, options.height ?? 5);
  const border = options.border ?? theme.red;
  const fill = options.fill ?? theme.black;
  const text = options.text ?? theme.white;
  const middle = Math.floor(height / 2);

  drawHorizontalHexSurface(frame, x, y, width, height, fill, border);

  const title = truncateTuiText(options.title.toUpperCase(), width - 5);
  const titleRow = height <= 5 ? middle : Math.max(1, middle - 1);
  const subtitleRow = height <= 5 ? middle + 1 : middle;
  frame.centeredText(
    y + titleRow,
    title,
    {
      color: fill === theme.black ? border : text,
      bold: true,
    },
    x,
    width,
  );
  if (options.subtitle) {
    frame.centeredText(
      y + subtitleRow,
      truncateTuiText(options.subtitle, width - 4),
      { color: text, bold: true },
      x,
      width,
    );
  }
  if (options.tag && height >= 6) {
    frame.centeredText(
      y + Math.min(height - 2, middle + 1),
      truncateTuiText(options.tag, width - 4),
      { color: theme.dim },
      x,
      width,
    );
  }
}

export function drawAlertPlacard(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  kanji: string,
  label: string,
  phase: number,
  tone: string = theme.red,
  stripeTone: string = theme.amber,
): void {
  const w = Math.max(10, Math.floor(width));
  const h = 7;
  frame.fill(x, y, w, h, " ", { background: theme.black });
  frame.box(x, y, w, h, { color: tone, bold: true }, false, true);
  frame.text(x + 1, y + 1, denseDiagonalStripe(w - 2, phase % 2), {
    color: stripeTone,
    background: theme.black,
    bold: true,
  });
  frame.centeredText(y + 2, kanji, { color: tone, bold: true }, x, w);
  frame.centeredText(
    y + 3,
    truncateTuiText(label.toUpperCase(), w - 2),
    { color: theme.white, bold: true },
    x,
    w,
  );
  frame.centeredText(
    y + 4,
    "ALERT",
    { color: tone, bold: true, blink: true },
    x,
    w,
  );
  frame.text(x + 1, y + 5, denseDiagonalStripe(w - 2, phase % 2, true), {
    color: stripeTone,
    background: theme.black,
    bold: true,
  });
}

export function drawDossier(
  frame: TuiFrame,
  options: PanelOptions & { phase?: number },
): { x: number; y: number; width: number; height: number } {
  const x = Math.floor(options.x);
  const y = Math.floor(options.y);
  const width = Math.max(22, Math.floor(options.width));
  const height = Math.max(8, Math.floor(options.height ?? 12));
  const border = options.border ?? theme.red;
  const phase = options.phase ?? 0;
  frame.fill(x, y, width, height, " ", { background: theme.black });
  frame.box(x, y, width, height, { color: border, bold: true }, false, true);
  frame.text(
    x + 1,
    y + 1,
    denseDiagonalStripe(width - 2, phase % 2),
    { color: border, background: theme.black, bold: true, blink: true },
  );
  frame.text(
    x + 1,
    y + height - 2,
    denseDiagonalStripe(width - 2, phase % 2),
    { color: border, background: theme.black, bold: true, blink: true },
  );
  for (let row = y + 2; row < y + height - 2; row += 1) {
    const sideBand = "◢◤";
    const sideBandStyle = {
      color: border,
      background: theme.black,
      bold: true,
      blink: true,
    } as const;
    frame.text(x + 1, row, sideBand, sideBandStyle);
    frame.text(x + width - 3, row, sideBand, sideBandStyle);
  }
  if (options.title) {
    const label = ` ${truncateTuiText(options.title.toUpperCase(), width - 8)} `;
    frame.text(x + Math.floor((width - tuiTextWidth(label)) / 2), y, label, {
      color: theme.black,
      background: border,
      bold: true,
    });
  }
  return { x: x + 4, y: y + 2, width: width - 8, height: height - 4 };
}

export function drawFilledDiamond(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  tone: string,
  label?: string,
  triangleCaps = false,
): void {
  const w = Math.max(triangleCaps ? 8 : 7, Math.floor(width));
  const h = Math.max(3, Math.floor(height) | 1);
  const left = Math.floor(x);
  const top = Math.floor(y);
  const middle = Math.floor(h / 2);
  const minimumSpan = triangleCaps ? 2 : 1;

  for (let row = 0; row < h; row += 1) {
    if (triangleCaps && (row === 0 || row === h - 1)) {
      const tip = row === 0 ? "◢◣" : "◥◤";
      frame.text(left + Math.floor((w - 2) / 2), top + row, tip, {
        color: tone,
        bold: true,
      });
      continue;
    }

    const distance = Math.abs(middle - row);
    const progress = (middle - distance) / Math.max(1, middle);
    let spanWidth =
      minimumSpan + Math.round((w - minimumSpan) * progress);
    if (spanWidth % 2 !== w % 2) {
      spanWidth = Math.max(minimumSpan, spanWidth - 1);
    }
    const inset = Math.floor((w - spanWidth) / 2);
    frame.fill(left + inset, top + row, spanWidth, 1, " ", {
      color: tone,
      background: tone,
    });

    if (triangleCaps && row !== middle) {
      const upper = row < middle;
      frame.put(left + inset - 1, top + row, upper ? "◢" : "◤", {
        color: tone,
        bold: true,
      });
      frame.put(
        left + inset + spanWidth,
        top + row,
        upper ? "◣" : "◥",
        {
          color: tone,
          bold: true,
        },
      );
    }
  }

  if (label) {
    frame.centeredText(
      top + middle,
      truncateTuiText(label.toUpperCase(), w - 2),
      {
        color: theme.black,
        background: tone,
        bold: true,
      },
      left,
      w,
    );
  }
}

export function drawSquareWarningTile(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  tone: string,
): void {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const w = Math.max(9, Math.floor(width));
  const h = Math.max(5, Math.floor(height));
  const edgeStyle = {
    color: theme.black,
    background: tone,
    bold: true,
  } as const;

  frame.fill(left, top, w, h, " ", {
    color: tone,
    background: tone,
  });
  frame.hLine(left + 1, top, w - 2, "━", edgeStyle);
  frame.hLine(left + 1, top + h - 1, w - 2, "━", edgeStyle);
  frame.vLine(left, top + 1, h - 2, "┃", edgeStyle);
  frame.vLine(left + w - 1, top + 1, h - 2, "┃", edgeStyle);
  frame.put(left, top, "┏", edgeStyle);
  frame.put(left + w - 1, top, "┓", edgeStyle);
  frame.put(left, top + h - 1, "┗", edgeStyle);
  frame.put(left + w - 1, top + h - 1, "┛", edgeStyle);

  const middle = top + Math.floor(h / 2);
  frame.centeredText(
    middle - 1,
    "▲",
    { color: theme.black, background: tone, bold: true },
    left,
    w,
  );
  frame.centeredText(
    middle,
    "WARNING",
    { color: theme.black, background: tone, bold: true },
    left,
    w,
  );
  frame.centeredText(
    middle + 1,
    "▼",
    { color: theme.black, background: tone, bold: true },
    left,
    w,
  );
}

export function drawWarningField(
  frame: TuiFrame,
  phase: number,
  tone: string = theme.crimson,
  entrancePhase = 11,
): void {
  const tileWidth = 9;
  const tileHeight = 5;
  const horizontalStep = tileWidth + 3;
  const verticalStep = tileHeight + 2;
  const revealTicks = 11;
  const gradientColumns = 2;
  const columnCount = Math.ceil(frame.width / horizontalStep);
  const entranceProgress = Math.max(
    0,
    Math.min(1, entrancePhase / revealTicks),
  );
  const sweepPosition =
    entranceProgress * (columnCount + gradientColumns);
  for (
    let y = 0, rowIndex = 0;
    y < frame.height;
    y += verticalStep, rowIndex += 1
  ) {
    for (
      let x = 0, columnIndex = 0;
      x < frame.width;
      x += horizontalStep, columnIndex += 1
    ) {
      const bright =
        (columnIndex +
          rowIndex +
          Math.floor(phase / 8)) %
          4 ===
        0;
      const targetFill = bright ? theme.red : tone;
      const rawTileProgress = Math.max(
        0,
        Math.min(1, (sweepPosition - columnIndex) / gradientColumns),
      );
      const tileProgress =
        rawTileProgress ** 2 * (3 - 2 * rawTileProgress);
      if (tileProgress === 0) continue;
      const fill = blendHexColor(theme.black, targetFill, tileProgress);
      drawSquareWarningTile(frame, x, y, tileWidth, tileHeight, fill);
    }
  }
}

export function drawParallelogram(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  direction: -1 | 1,
  tone: string,
  accent = theme.orange,
): void {
  const w = Math.max(4, Math.floor(width));
  drawAssetSkewBlade(frame, x, y, w, 2, direction, tone, accent);
}
