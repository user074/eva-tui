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
    denseDiagonalStripe(width - 2, phase % 2, true),
    { color: border, background: theme.black, bold: true, blink: true },
  );
  for (let row = y + 2; row < y + height - 2; row += 1) {
    frame.text(
      x + 1,
      row,
      denseDiagonalStripe(2, row % 2),
      {
        color: border,
        background: theme.black,
        bold: true,
        blink: true,
      },
    );
    frame.text(
      x + width - 3,
      row,
      denseDiagonalStripe(2, row % 2, true),
      {
        color: border,
        background: theme.black,
        bold: true,
        blink: true,
      },
    );
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

export function drawWarningField(
  frame: TuiFrame,
  phase: number,
  tone: string = theme.crimson,
): void {
  const tileWidth = 15;
  const tileHeight = 5;
  for (let y = -2; y < frame.height + tileHeight; y += tileHeight) {
    const rowIndex = Math.floor((y + 2) / tileHeight);
    const shift = rowIndex % 2 === 0 ? 0 : 7;
    for (let x = -8 + shift; x < frame.width; x += tileWidth) {
      const bright =
        (Math.floor(x / tileWidth) + rowIndex + Math.floor(phase / 8)) % 4 === 0;
      const fill = bright ? theme.red : tone;
      frame.text(x + 3, y, `◢${"▇".repeat(7)}◣`, {
        color: fill,
        bold: true,
      });
      frame.text(x + 1, y + 1, `◢${"▇".repeat(11)}◣`, {
        color: fill,
        bold: true,
      });
      frame.text(x, y + 2, `◀${"▇".repeat(13)}▶`, {
        color: fill,
        bold: true,
      });
      frame.centeredText(y + 2, "WARNING", {
        color: theme.black,
        background: fill,
        bold: true,
      }, x, tileWidth);
      frame.text(x + 1, y + 3, `◥${"▇".repeat(11)}◤`, {
        color: fill,
        bold: true,
      });
      frame.text(x + 3, y + 4, `◥${"▇".repeat(7)}◤`, {
        color: fill,
        bold: true,
      });
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
