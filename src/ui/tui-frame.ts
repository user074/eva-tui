export interface TuiStyle {
  color?: string | null;
  background?: string | null;
  bold?: boolean;
  dim?: boolean;
  blink?: boolean;
}

export interface TuiCell {
  char: string;
  continuation: boolean;
  color: string | null;
  background: string | null;
  bold: boolean;
  dim: boolean;
  blink: boolean;
}

export interface TuiRun {
  text: string;
  color: string | null;
  background: string | null;
  bold: boolean;
  dim: boolean;
  blink: boolean;
}

const EMPTY_CELL: Readonly<TuiCell> = {
  char: " ",
  continuation: false,
  color: null,
  background: null,
  bold: false,
  dim: false,
  blink: false,
};

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

function isCombiningCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

export function tuiCharacterWidth(character: string): number {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined || codePoint === 0) return 0;
  if (isCombiningCodePoint(codePoint)) return 0;
  return isWideCodePoint(codePoint) ? 2 : 1;
}

export function tuiTextWidth(value: string): number {
  return Array.from(value).reduce(
    (width, character) => width + tuiCharacterWidth(character),
    0,
  );
}

export function truncateTuiText(value: string, maxWidth: number): string {
  const target = Math.max(0, Math.floor(maxWidth));
  if (tuiTextWidth(value) <= target) return value;
  if (target === 0) return "";
  if (target === 1) return "…";

  let output = "";
  let width = 0;
  for (const character of Array.from(value)) {
    const characterWidth = tuiCharacterWidth(character);
    if (width + characterWidth > target - 1) break;
    output += character;
    width += characterWidth;
  }
  return `${output}…`;
}

function freshCell(): TuiCell {
  return { ...EMPTY_CELL };
}

export class TuiFrame {
  readonly width: number;
  readonly height: number;
  private readonly cells: TuiCell[][];

  constructor(width: number, height: number, style: TuiStyle = {}) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => ({
        ...freshCell(),
        ...style,
      })),
    );
  }

  rows(): readonly (readonly TuiCell[])[] {
    return this.cells;
  }

  cell(x: number, y: number): TuiCell | undefined {
    return this.cells[Math.floor(y)]?.[Math.floor(x)];
  }

  put(x: number, y: number, character: string, style: TuiStyle = {}): this {
    const column = Math.floor(x);
    const row = Math.floor(y);
    const target = this.cells[row]?.[column];
    const first = Array.from(character)[0] ?? " ";
    const characterWidth = tuiCharacterWidth(first);
    if (!target || characterWidth === 0) return this;
    if (characterWidth === 2 && column + 1 >= this.width) return this;

    const inheritedStyle = {
      color: target.color,
      background: target.background,
      bold: target.bold,
      dim: target.dim,
      blink: target.blink,
    };
    this.clearWideCell(column, row);
    Object.assign(target, {
      char: first,
      continuation: false,
      ...inheritedStyle,
      ...style,
    });

    if (characterWidth === 2) {
      const continuation = this.cells[row]?.[column + 1];
      if (continuation) {
        this.clearWideCell(column + 1, row);
        Object.assign(continuation, {
          char: "",
          continuation: true,
          color: target.color,
          background: target.background,
          bold: target.bold,
          dim: target.dim,
          blink: target.blink,
        });
      }
    }
    return this;
  }

  text(x: number, y: number, value: string, style: TuiStyle = {}): this {
    let column = Math.floor(x);
    const row = Math.floor(y);
    for (const character of Array.from(value)) {
      const characterWidth = tuiCharacterWidth(character);
      if (characterWidth === 0) continue;
      if (column >= this.width) break;
      this.put(column, row, character, style);
      column += characterWidth;
    }
    return this;
  }

  centeredText(
    y: number,
    value: string,
    style: TuiStyle = {},
    x = 0,
    width = this.width,
  ): this {
    const clipped = truncateTuiText(value, width);
    const start = x + Math.floor((width - tuiTextWidth(clipped)) / 2);
    return this.text(start, y, clipped, style);
  }

  fill(
    x: number,
    y: number,
    width: number,
    height: number,
    character = " ",
    style: TuiStyle = {},
  ): this {
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(this.width, Math.floor(x + width));
    const endY = Math.min(this.height, Math.floor(y + height));
    for (let row = startY; row < endY; row += 1) {
      for (let column = startX; column < endX; column += 1) {
        this.put(column, row, character, style);
      }
    }
    return this;
  }

  hLine(
    x: number,
    y: number,
    width: number,
    character = "─",
    style: TuiStyle = {},
  ): this {
    return this.fill(x, y, width, 1, character, style);
  }

  vLine(
    x: number,
    y: number,
    height: number,
    character = "│",
    style: TuiStyle = {},
  ): this {
    const column = Math.floor(x);
    for (let row = Math.floor(y); row < Math.floor(y + height); row += 1) {
      this.put(column, row, character, style);
    }
    return this;
  }

  box(
    x: number,
    y: number,
    width: number,
    height: number,
    style: TuiStyle = {},
    double = false,
    rounded = false,
  ): this {
    const w = Math.max(2, Math.floor(width));
    const h = Math.max(2, Math.floor(height));
    const glyphs = rounded
      ? { top: "─", side: "│", tl: "╭", tr: "╮", bl: "╰", br: "╯" }
      : double
      ? { top: "═", side: "║", tl: "╔", tr: "╗", bl: "╚", br: "╝" }
      : { top: "─", side: "│", tl: "┌", tr: "┐", bl: "└", br: "┘" };
    this.hLine(x + 1, y, w - 2, glyphs.top, style);
    this.hLine(x + 1, y + h - 1, w - 2, glyphs.top, style);
    this.vLine(x, y + 1, h - 2, glyphs.side, style);
    this.vLine(x + w - 1, y + 1, h - 2, glyphs.side, style);
    this.put(x, y, glyphs.tl, style);
    this.put(x + w - 1, y, glyphs.tr, style);
    this.put(x, y + h - 1, glyphs.bl, style);
    this.put(x + w - 1, y + h - 1, glyphs.br, style);
    return this;
  }

  private clearWideCell(x: number, y: number): void {
    const target = this.cells[y]?.[x];
    if (!target) return;
    if (target.continuation && x > 0) {
      const lead = this.cells[y]?.[x - 1];
      if (lead && tuiCharacterWidth(lead.char) === 2) {
        Object.assign(lead, freshCell());
      }
    } else if (tuiCharacterWidth(target.char) === 2) {
      const continuation = this.cells[y]?.[x + 1];
      if (continuation) Object.assign(continuation, freshCell());
    }
    Object.assign(target, freshCell());
  }
}

function ansiColor(color: string | null, layer: 38 | 48): string {
  if (!color) return `\u001b[${layer === 38 ? 39 : 49}m`;
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return `\u001b[${layer === 38 ? 39 : 49}m`;
  return `\u001b[${layer};2;${Number.parseInt(match[1] ?? "ff", 16)};${Number.parseInt(match[2] ?? "ff", 16)};${Number.parseInt(match[3] ?? "ff", 16)}m`;
}

function tuiRowToAnsi(row: readonly TuiCell[]): string {
  let output = "";
  let color: string | null = null;
  let background: string | null = null;
  let bold = false;
  let dim = false;
  let blink = false;
  for (const cell of row) {
    if (cell.continuation) continue;
    if (cell.color !== color) {
      output += ansiColor(cell.color, 38);
      color = cell.color;
    }
    if (cell.background !== background) {
      output += ansiColor(cell.background, 48);
      background = cell.background;
    }
    if (cell.bold !== bold || cell.dim !== dim) {
      output += "\u001b[22m";
      if (cell.bold) output += "\u001b[1m";
      if (cell.dim) output += "\u001b[2m";
      bold = cell.bold;
      dim = cell.dim;
    }
    if (cell.blink !== blink) {
      output += cell.blink ? "\u001b[5m" : "\u001b[25m";
      blink = cell.blink;
    }
    output += cell.char;
  }
  return `${output}\u001b[0m`;
}

export function tuiFrameToAnsiRows(frame: TuiFrame): string[] {
  return frame.rows().map(tuiRowToAnsi);
}

export function tuiFrameToRuns(frame: TuiFrame): TuiRun[][] {
  return frame.rows().map((row) => {
    const runs: TuiRun[] = [];
    for (const cell of row) {
      if (cell.continuation) continue;
      const current = runs.at(-1);
      if (
        current &&
        current.color === cell.color &&
        current.background === cell.background &&
        current.bold === cell.bold &&
        current.dim === cell.dim &&
        current.blink === cell.blink
      ) {
        current.text += cell.char;
      } else {
        runs.push({
          text: cell.char,
          color: cell.color,
          background: cell.background,
          bold: cell.bold,
          dim: cell.dim,
          blink: cell.blink,
        });
      }
    }
    return runs;
  });
}

export function tuiFrameToAnsi(frame: TuiFrame): string {
  return tuiFrameToAnsiRows(frame).join("\n");
}

export function tuiFrameToText(frame: TuiFrame): string {
  return frame
    .rows()
    .map((row) => row.filter((cell) => !cell.continuation).map((cell) => cell.char).join(""))
    .join("\n");
}
