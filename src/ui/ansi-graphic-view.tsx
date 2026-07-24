import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Text } from "ink";

import { renderGraphicAnsi } from "../graphics/ansi.js";
import type { GraphicScene } from "../graphics/compositions.js";
import type { Station } from "./operations-model.js";
import { theme } from "./theme.js";

export function AnsiGraphicView({
  scene,
  columns,
  rows,
  stations = [],
  selectedIndex = 0,
  incidentDetail,
  simulation,
  fallback,
}: {
  scene: GraphicScene;
  columns: number;
  rows: number;
  stations?: Station[];
  selectedIndex?: number;
  incidentDetail?: string;
  simulation?: boolean;
  fallback: ReactNode;
}): ReactNode {
  const [frame, setFrame] = useState("");
  const [fault, setFault] = useState("");
  const stationSignature = useMemo(
    () =>
      stations
        .map((station) =>
          [
            station.id,
            station.label,
            station.status,
            station.eventCount,
          ].join(":"),
        )
        .join("|"),
    [stations],
  );

  useEffect(() => {
    let cancelled = false;
    setFault("");

    void renderGraphicAnsi({
      scene,
      columns,
      rows,
      stations,
      selectedIndex,
      ...(incidentDetail ? { incidentDetail } : {}),
      ...(simulation === undefined ? {} : { simulation }),
    })
      .then((rendered) => {
        if (!cancelled) setFrame(rendered);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFault(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    columns,
    incidentDetail,
    rows,
    scene,
    selectedIndex,
    simulation,
    stationSignature,
  ]);

  if (fault) {
    return (
      <Box flexDirection="column">
        {fallback}
        <Text color={theme.red}>ANSI RASTER FALLBACK · {fault}</Text>
      </Box>
    );
  }

  if (!frame) {
    return (
      <Box
        width={columns}
        height={rows}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <Text color={theme.orange} bold>
          ANSI DISPLAY CALIBRATION / 画像変換
        </Text>
        <Text color={theme.dim}>Rasterizing operational composition…</Text>
      </Box>
    );
  }

  return (
    <Box width={columns} height={rows} flexShrink={0}>
      <Text>{frame}</Text>
    </Box>
  );
}
