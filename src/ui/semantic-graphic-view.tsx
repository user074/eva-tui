import type { ReactNode } from "react";

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
  const frame =
    scene === "earthquake"
      ? buildEarthquakeFrame({
          columns,
          rows,
          phase,
          incidentDetail,
          simulation,
        })
      : scene === "tsunami"
        ? buildTsunamiFrame({ columns, rows, phase, state })
        : buildStationFrame({
            columns,
            rows,
            phase,
            stations,
            selectedIndex,
          });
  return <TuiFrameView frame={frame} />;
}
