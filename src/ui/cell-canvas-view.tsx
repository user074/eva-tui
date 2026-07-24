import type { ReactNode } from "react";
import { Box, Text } from "ink";

import type { CanvasFrame } from "./cell-canvas.js";

function foreground(color: string | null): string {
  if (!color) return "\u001b[39m";
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return "\u001b[39m";
  const red = Number.parseInt(match[1] ?? "ff", 16);
  const green = Number.parseInt(match[2] ?? "ff", 16);
  const blue = Number.parseInt(match[3] ?? "ff", 16);
  return `\u001b[38;2;${red};${green};${blue}m`;
}

export function frameToAnsi(frame: CanvasFrame): string {
  return frame
    .map((row) => {
      let output = "";
      let currentColor: string | null = null;
      for (const cell of row) {
        if (cell.color !== currentColor) {
          output += foreground(cell.color);
          currentColor = cell.color;
        }
        output += cell.char;
      }
      return `${output}\u001b[39m`;
    })
    .join("\n");
}

function frameWidth(frame: CanvasFrame): number {
  let width = 0;
  for (const row of frame) {
    if (row.length > width) {
      width = row.length;
    }
  }
  return width;
}

export function CellCanvasView({
  frame,
  align = "center",
}: {
  frame: CanvasFrame;
  align?: "flex-start" | "center" | "flex-end";
}): ReactNode {
  return (
    <Box
      flexDirection="column"
      alignItems={align}
      flexShrink={0}
      width={frameWidth(frame)}
    >
      <Text>{frameToAnsi(frame)}</Text>
    </Box>
  );
}
