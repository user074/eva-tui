import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Text, useStdout } from "ink";

import { renderGraphicPng, type GraphicScene } from "../graphics/compositions.js";
import {
  kittyDeleteImage,
  kittyPlaceholder,
  kittyTransmitPng,
} from "../graphics/kitty.js";
import type { Station } from "./operations-model.js";
import { theme } from "./theme.js";

const IMAGE_IDS: Record<GraphicScene, number> = {
  earthquake: 231,
  tsunami: 232,
  stations: 233,
};

export function TerminalGraphicView({
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
  const { stdout } = useStdout();
  const [ready, setReady] = useState(false);
  const [fault, setFault] = useState("");
  const imageId = IMAGE_IDS[scene];
  const tmux = Boolean(process.env.TMUX);
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
    setReady(false);
    setFault("");

    void renderGraphicPng({
      scene,
      columns,
      rows,
      stations,
      selectedIndex,
      ...(incidentDetail ? { incidentDetail } : {}),
      ...(simulation === undefined ? {} : { simulation }),
    })
      .then((png) => {
        if (cancelled) return;
        stdout.write(
          kittyTransmitPng(png, {
            imageId,
            columns,
            rows,
            ...(tmux ? { tmux: true } : {}),
          }),
        );
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFault(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
      stdout.write(kittyDeleteImage(imageId, tmux));
    };
  }, [
    columns,
    imageId,
    incidentDetail,
    rows,
    scene,
    selectedIndex,
    simulation,
    stationSignature,
    stdout,
    tmux,
  ]);

  if (fault) {
    return (
      <Box flexDirection="column">
        {fallback}
        <Text color={theme.red}>TIER 3 FALLBACK · {fault}</Text>
      </Box>
    );
  }

  if (!ready) {
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
          GPU DISPLAY CALIBRATION / 画像転送
        </Text>
        <Text color={theme.dim}>Rendering reference-grounded terminal layer…</Text>
      </Box>
    );
  }

  return (
    <Box width={columns} height={rows} flexShrink={0}>
      <Text>{kittyPlaceholder(imageId, columns, rows)}</Text>
    </Box>
  );
}
