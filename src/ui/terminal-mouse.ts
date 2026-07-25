export const ENABLE_TERMINAL_MOUSE =
  "\u001B[?1000h\u001B[?1002h\u001B[?1006h\u001B[?1007h";
export const DISABLE_TERMINAL_MOUSE =
  "\u001B[?1007l\u001B[?1006l\u001B[?1002l\u001B[?1000l";

export interface TerminalMouseWheel {
  direction: "up" | "down";
  column: number;
  row: number;
}

export interface TerminalMouseButton {
  button: number;
  action: "press" | "release";
  column: number;
  row: number;
}

export type TerminalMouseEvent =
  | ({ kind: "wheel" } & TerminalMouseWheel)
  | ({ kind: "button" } & TerminalMouseButton);

export function parseTerminalMouseEvent(
  input: string,
): TerminalMouseEvent | null {
  const normalized = input.startsWith("\u001B")
    ? input.slice(1)
    : input;
  const match = /^\[<(\d+);(\d+);(\d+)([mM])$/.exec(normalized);
  if (!match) return null;

  const button = Number(match[1]);
  const column = Number(match[2]);
  const row = Number(match[3]);
  if ((button & 64) !== 0) {
    return {
      kind: "wheel",
      direction: (button & 1) === 0 ? "up" : "down",
      column,
      row,
    };
  }

  return {
    kind: "button",
    button: button & 3,
    action: match[4] === "M" ? "press" : "release",
    column,
    row,
  };
}

export function parseTerminalMouseWheel(
  input: string,
): TerminalMouseWheel | null {
  const event = parseTerminalMouseEvent(input);
  if (!event || event.kind !== "wheel") return null;
  return {
    direction: event.direction,
    column: event.column,
    row: event.row,
  };
}
