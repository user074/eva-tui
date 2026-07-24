import { useEffect, useState, type ReactNode } from "react";

import type { GraphicScene } from "../graphics/compositions.js";
import type { AppState } from "../state/model.js";
import type { Station } from "./operations-model.js";
import {
  buildEarthquakeFrame,
  buildStationFrame,
  buildTsunamiFrame,
} from "./semantic-scenes.js";
import { TuiFrameView } from "./tui-frame-view.js";

export function SemanticGraphicView({
  scene,
  columns,
  rows,
  phase,
  stations = [],
  selectedIndex = 0,
  incidentDetail = "The active turn ended in a failed state.",
  simulation = true,
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
  state?: AppState;
}): ReactNode {
  const [motionPhase, setMotionPhase] = useState(0);

  // Keep operational movement local to the scene leaf. This avoids rerendering
  // the full application and lets memoized TuiFrame rows discard unchanged
  // output. The low cadence remains legible without driving an idle 30–60 FPS
  // loop.
  useEffect(() => {
    const timer = setInterval(() => {
      setMotionPhase((current) => (current + 1) % 10_000);
    }, 480);
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
