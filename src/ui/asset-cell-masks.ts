import { TuiFrame } from "./tui-frame.js";
import { theme } from "./theme.js";

interface CellHexOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  capRatio: number;
  fill: string;
}

function hexRowInset(
  row: number,
  height: number,
  capColumns: number,
): number {
  const middle = (height - 1) / 2;
  if (middle <= 0) return 0;
  return Math.round((Math.abs(row - middle) / middle) * capColumns);
}

/**
 * A terminal-native interpretation of a horizontal SVG hexagon.
 *
 * The SVG cap ratio determines how far the ends recede, but the result is
 * constructed as filled terminal spans with diagonal cap glyphs. This avoids
 * pretending that a terminal cell is a square image pixel.
 */
function drawCellHexSurface(
  frame: TuiFrame,
  options: CellHexOptions,
): void {
  const x = Math.floor(options.x);
  const y = Math.floor(options.y);
  const width = Math.max(6, Math.floor(options.width));
  const height = Math.max(3, Math.floor(options.height));
  const capColumns = Math.max(
    1,
    Math.min(
      Math.floor((width - 4) / 2),
      Math.round(width * options.capRatio),
    ),
  );
  const middle = (height - 1) / 2;

  for (let row = 0; row < height; row += 1) {
    const inset = hexRowInset(row, height, capColumns);
    const left = x + inset;
    const right = x + width - inset - 1;
    if (right < left) continue;

    const centered = Math.abs(row - middle) < 0.5;
    const above = row < middle;
    if (centered) {
      frame.fill(left, y + row, right - left + 1, 1, " ", {
        background: options.fill,
      });
      continue;
    }

    const leftOutside = frame.cell(left, y + row)?.background ?? theme.black;
    const rightOutside =
      frame.cell(right, y + row)?.background ?? theme.black;
    if (right - left > 1) {
      frame.fill(left + 1, y + row, right - left - 1, 1, " ", {
        background: options.fill,
      });
    }
    // Inverted masks: the background paints a gap-free shape surface and the
    // foreground glyph removes the outside corner. This is more stable than
    // asking two unrelated foreground glyphs to meet exactly.
    frame.put(left, y + row, above ? "◤" : "◣", {
      color: leftOutside,
      background: options.fill,
      bold: true,
    });
    if (right > left) {
      frame.put(right, y + row, above ? "◥" : "◢", {
        color: rightOutside,
        background: options.fill,
        bold: true,
      });
    }
  }
}

function drawInsetSeam(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  capRatio: number,
  fill: string,
  seam: string,
): void {
  const capColumns = Math.max(1, Math.round(width * capRatio));
  const seamX = x + capColumns + 1;
  const seamWidth = Math.max(0, width - (capColumns + 1) * 2);
  if (seamWidth === 0) return;
  frame.hLine(seamX, y, seamWidth, "━", {
    color: seam,
    background: fill,
  });
  frame.hLine(seamX, y + height - 1, seamWidth, "━", {
    color: seam,
    background: fill,
  });
}

/**
 * Conceptual cell port of long_shape.svg.
 *
 * 146.257/1564 is the source cap ratio. The red/black/red sandwich is
 * represented by a filled chassis plus top and bottom inset seams because the
 * SVG's five-pixel rings are below terminal-cell resolution.
 */
export function drawAssetLongHex(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  seam: string = theme.black,
): void {
  const capRatio = 146.257 / 1564;
  drawCellHexSurface(frame, { x, y, width, height, capRatio, fill });
  drawInsetSeam(
    frame,
    x,
    y,
    width,
    height,
    capRatio,
    fill,
    seam,
  );
}

/**
 * Conceptual cell port of hex_shape.svg.
 *
 * Its much deeper 145.77/584 cap ratio produces a compact data hex rather
 * than stretching the long-warning chassis into another generic panel.
 */
export function drawAssetDataHex(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  seam: string = theme.black,
): void {
  const capRatio = 145.77 / 584;
  drawCellHexSurface(frame, { x, y, width, height, capRatio, fill });
  drawInsetSeam(
    frame,
    x,
    y,
    width,
    height,
    capRatio,
    fill,
    seam,
  );
}

/**
 * Conceptual cell port of warning_shape_black.svg.
 *
 * A red outer chassis and a black inset preserve the source's layered warning
 * silhouette without attempting to squeeze four vector outlines into five
 * terminal rows.
 */
export function drawAssetWarningHex(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  tone: string,
): void {
  const capRatio = 145.77 / 584;
  const w = Math.max(6, Math.floor(width));
  const h = Math.max(3, Math.floor(height));
  const capColumns = Math.max(
    1,
    Math.min(Math.floor((w - 4) / 2), Math.round(w * capRatio)),
  );
  const middle = (h - 1) / 2;
  for (let row = 0; row < h; row += 1) {
    const inset = hexRowInset(row, h, capColumns);
    const left = Math.floor(x) + inset;
    const right = Math.floor(x) + w - inset - 1;
    const centered = Math.abs(row - middle) < 0.5;
    const above = row < middle;
    const targetY = Math.floor(y) + row;
    if (centered) {
      frame.put(left, targetY, " ", { background: tone });
    } else {
      frame.put(left, targetY, above ? "◤" : "◣", {
        color: theme.black,
        background: tone,
        bold: true,
      });
    }
    if (right > left) {
      if (centered) {
        frame.put(right, targetY, " ", { background: tone });
      } else {
        frame.put(right, targetY, above ? "◥" : "◢", {
          color: theme.black,
          background: tone,
          bold: true,
        });
      }
    }
    if (row === 0 && right - left > 1) {
      frame.hLine(left + 1, Math.floor(y), right - left - 1, "━", {
        color: tone,
      });
    } else if (row === h - 1 && right - left > 1) {
      frame.hLine(
        left + 1,
        Math.floor(y) + row,
        right - left - 1,
        "━",
        { color: tone },
      );
    }
  }
}

/**
 * Conceptual cell port of SkewRectangle_Red.svg and its flipped companion.
 *
 * A 500x100 source blade is closest to one terminal row, not two. Diagonal
 * end caps express the skew; background fill carries its color mass; a
 * connecting rule represents the thin orange 19/100 accent strip.
 */
export function drawAssetSkewBlade(
  frame: TuiFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  direction: -1 | 1,
  tone: string,
  accent: string = theme.orange,
): void {
  const w = Math.max(5, Math.floor(width));
  const leftCutout = direction < 0 ? "◤" : "◣";
  const rightCutout = direction < 0 ? "◢" : "◥";
  const capWidth = Math.max(
    1,
    Math.min(w - 2, Math.round(w * (168.5 / 500))),
  );

  const leftOutside = frame.cell(x, y)?.background ?? theme.black;
  const rightOutside =
    frame.cell(x + w - 1, y)?.background ?? theme.black;
  frame.put(x, y, leftCutout, {
    color: leftOutside,
    background: tone,
    bold: true,
  });
  frame.fill(x + 1, y, w - 2, 1, " ", {
    background: tone,
  });
  frame.put(x + w - 1, y, rightCutout, {
    color: rightOutside,
    background: tone,
    bold: true,
  });
  frame.hLine(x + 1, y, capWidth, "━", {
    color: accent,
    background: tone,
    bold: true,
  });
  void height;
}
