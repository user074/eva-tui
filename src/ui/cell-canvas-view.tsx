import type { ReactNode } from "react";
import { Box, Text } from "ink";

import type { CanvasFrame } from "./cell-canvas.js";

function ansiColor(color: string | null, layer: 38 | 48): string {
  if (!color) return `\u001b[${layer === 38 ? 39 : 49}m`;
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return `\u001b[${layer === 38 ? 39 : 49}m`;
  const red = Number.parseInt(match[1] ?? "ff", 16);
  const green = Number.parseInt(match[2] ?? "ff", 16);
  const blue = Number.parseInt(match[3] ?? "ff", 16);
  return `\u001b[${layer};2;${red};${green};${blue}m`;
}

export function frameToAnsi(frame: CanvasFrame): string {
  return frame
    .map((row) => {
      let output = "";
      let currentColor: string | null = null;
      let currentBackground: string | null = null;
      for (const cell of row) {
        if (cell.color !== currentColor) {
          output += ansiColor(cell.color, 38);
          currentColor = cell.color;
        }
        if (cell.background !== currentBackground) {
          output += ansiColor(cell.background, 48);
          currentBackground = cell.background;
        }
        output += cell.char;
      }
      return `${output}\u001b[39;49m`;
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
