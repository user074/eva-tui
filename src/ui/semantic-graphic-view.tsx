import { useEffect, useState, type ReactNode } from "react";

import type { GraphicScene } from "../graphics/compositions.js";
import type { AppState } from "../state/model.js";
import {
  conversationSynchronization,
  type Station,
} from "./operations-model.js";
import {
  buildEarthquakeFrame,
  buildStationFrame,
  buildTsunamiFrame,
} from "./semantic-scenes.js";
import { TuiFrameView } from "./tui-frame-view.js";

export const SEMANTIC_MOTION_INTERVAL_MS = 400;
export const EARTHQUAKE_SYNCHRONIZATION_SWEEP_MS = 10_000;

export function earthquakeSynchronizationAtPhase(
  motionPhase: number,
): number {
  const elapsedMs =
    Math.max(0, Math.floor(motionPhase)) * SEMANTIC_MOTION_INTERVAL_MS;
  return Math.min(
    100,
    Math.round(
      (elapsedMs / EARTHQUAKE_SYNCHRONIZATION_SWEEP_MS) * 100,
    ),
  );
}

export function SemanticGraphicView({
  scene,
  columns,
  rows,
  phase,
  stations = [],
  selectedIndex = 0,
  incidentDetail = "The active turn ended in a failed state.",
  simulation = true,
  synchronizationPercent,
  state,
}: {
  scene: GraphicScene;
  columns: number;
  rows: number;
  phase: number;
  stations?: Station[];
  selectedIndex?: number;
  incidentDetail?: string;
  simulation?: boolean;
  synchronizationPercent?: number;
  state?: AppState;
}): ReactNode {
  const [motionPhase, setMotionPhase] = useState(0);
  const measuredSynchronization =
    state === undefined
      ? null
      : conversationSynchronization(state, Date.now()).percent;
  const simulatedSynchronization =
    scene === "earthquake" &&
    simulation &&
    synchronizationPercent === undefined
      ? earthquakeSynchronizationAtPhase(motionPhase)
      : null;
  const scopeSynchronization =
    synchronizationPercent ??
    simulatedSynchronization ??
    measuredSynchronization ??
    0;

  // Keep operational movement local to the scene leaf. This avoids rerendering
  // the full application and lets memoized TuiFrame rows discard unchanged
  // output. The low cadence remains legible without driving an idle 30–60 FPS
  // loop.
  useEffect(() => {
    const timer = setInterval(() => {
      setMotionPhase((current) => current + 1);
    }, SEMANTIC_MOTION_INTERVAL_MS);
    timer.unref();
    return () => clearInterval(timer);
  }, [scene]);

  const frame =
    scene === "earthquake"
      ? buildEarthquakeFrame({
          columns,
          rows,
          phase,
          motionPhase,
          incidentDetail,
          simulation,
          synchronizationPercent: scopeSynchronization,
        })
      : scene === "tsunami"
        ? buildTsunamiFrame({ columns, rows, phase, motionPhase, state })
        : buildStationFrame({
            columns,
            rows,
            phase,
            motionPhase,
            stations,
            selectedIndex,
          });
  return <TuiFrameView frame={frame} />;
}
