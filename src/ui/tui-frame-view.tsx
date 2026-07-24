import { memo, type ReactNode } from "react";
import { Box, Text } from "ink";

import {
  TuiFrame,
  tuiFrameToRuns,
  type TuiRun,
} from "./tui-frame.js";

function runsEqual(left: TuiRun[], right: TuiRun[]): boolean {
  return (
    left.length === right.length &&
    left.every((run, index) => {
      const candidate = right[index];
      return (
        candidate !== undefined &&
        run.text === candidate.text &&
        run.color === candidate.color &&
        run.background === candidate.background &&
        run.bold === candidate.bold &&
        run.dim === candidate.dim &&
        run.blink === candidate.blink
      );
    })
  );
}

const TuiRow = memo(
  function TuiRow({ runs }: { runs: TuiRun[] }): ReactNode {
    return (
      <Text>
        {runs.map((run, index) => (
          <Text
            key={index}
            {...(run.color ? { color: run.color } : {})}
            {...(run.background
              ? { backgroundColor: run.background }
              : {})}
            bold={run.bold}
            dimColor={run.dim}
          >
            {run.blink
              ? `\u001b[5m${run.text}\u001b[25m`
              : run.text}
          </Text>
        ))}
      </Text>
    );
  },
  (previous, next) => runsEqual(previous.runs, next.runs),
);

export function TuiFrameView({
  frame,
  align = "center",
}: {
  frame: TuiFrame;
  align?: "flex-start" | "center" | "flex-end";
}): ReactNode {
  // Keep full-frame raw ANSI out of Ink's text tree. Native Text styles make
  // the scene stable; the only inline escape is static SGR blink, whose motion
  // is performed by the terminal without recurring React renders.
  const rows = tuiFrameToRuns(frame);

  return (
    <Box
      width={frame.width}
      height={frame.height}
      flexDirection="column"
      alignItems={align}
      flexShrink={0}
    >
      {rows.map((runs, index) => (
        <TuiRow key={index} runs={runs} />
      ))}
    </Box>
  );
}
