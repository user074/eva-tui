import type { ReactNode } from "react";
import { Box, Text } from "ink";

import type { GraphicsBackend } from "../graphics/kitty.js";
import type { AppState, PendingApproval, PlanStep } from "../state/model.js";
import { Panel, Transcript } from "./components.js";
import {
  activityTrace,
  approvalSeverity,
  buildStations,
  impactNodes,
  SCENES,
  shortLabel,
  synchronization,
  type Scene,
} from "./operations-model.js";
import { SemanticGraphicView } from "./semantic-graphic-view.js";
import { TerminalGraphicView } from "./terminal-graphic-view.js";
import { statusColor, theme } from "./theme.js";

function rail(phase: number, width: number, danger = false): string {
  const a = danger ? "▓" : "╱";
  const b = danger ? "░" : "╲";
  return Array.from({ length: width }, (_, index) =>
    (index + Math.floor(phase / 2)) % 2 === 0 ? a : b,
  ).join("");
}

function gauge(percent: number | null, width: number): string {
  if (percent === null) return "░".repeat(width);
  const cells = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return `${"█".repeat(cells)}${"░".repeat(width - cells)}`;
}

function stateGlyph(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error")) return "▲";
  if (
    normalized.includes("run") ||
    normalized.includes("start") ||
    normalized.includes("active")
  ) {
    return "◆";
  }
  if (
    normalized.includes("ready") ||
    normalized.includes("complete") ||
    normalized.includes("online")
  ) {
    return "●";
  }
  return "○";
}

export function SceneTabs({ scene }: { scene: Scene }): ReactNode {
  return (
    <Box flexShrink={0}>
      {SCENES.map((item) => (
        <Text
          key={item}
          color={item === scene ? theme.black : theme.dim}
          bold={item === scene}
          {...(item === scene ? { backgroundColor: theme.orange } : {})}
        >
          {` ${item.toUpperCase()} `}
        </Text>
      ))}
      <Text color={theme.dim}> TAB 切替</Text>
    </Box>
  );
}

function PlanSpine({
  plan,
  maxItems,
}: {
  plan: PlanStep[];
  maxItems: number;
}): ReactNode {
  const visible = plan.slice(-maxItems);
  if (visible.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" paddingTop={1}>
        <Text color={theme.dim}>╲ │ ╱</Text>
        <Text color={theme.orange} bold>◇ STANDBY ◇</Text>
        <Text color={theme.dim}>╱ │ ╲</Text>
        <Text color={theme.dim}>AWAITING OPERATION PLAN</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {visible.map((step, index) => {
        const running = step.status === "in_progress";
        const completed = step.status === "completed";
        const glyph = completed ? "●" : running ? "◆" : "○";
        return (
          <Box key={`${step.step}-${index}`}>
            <Text color={index === visible.length - 1 ? theme.dim : theme.orange}>
              {index === visible.length - 1 ? "┗━━" : "┣━━"}
            </Text>
            <Text color={statusColor(step.status)} bold={running}>
              {glyph}{" "}
            </Text>
            <Text color={running ? theme.white : statusColor(step.status)} wrap="truncate-end">
              {step.step}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function ImpactField({
  state,
  width,
  compact,
}: {
  state: AppState;
  width: number;
  compact: boolean;
}): ReactNode {
  const nodes = impactNodes(state).slice(0, width >= 45 ? 8 : 5);
  if (nodes.length === 0) {
    if (compact) {
      return (
        <Box flexDirection="column" alignItems="center">
          <Text color={theme.orange} bold>╱╲  CODEX ◎  ╱╲</Text>
          <Text color={theme.dim}>NO WORKSPACE PROPAGATION</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" alignItems="center">
        <Text color={theme.dim}>╭───────────────╮</Text>
        <Text color={theme.dim}>│   ╱       ╲   │</Text>
        <Text color={theme.orange} bold>│  ╱  CODEX  ╲  │</Text>
        <Text color={theme.dim}>│  ╲    ◎    ╱  │</Text>
        <Text color={theme.dim}>│   ╲       ╱   │</Text>
        <Text color={theme.dim}>╰───────────────╯</Text>
        <Text color={theme.dim}>NO WORKSPACE PROPAGATION</Text>
      </Box>
    );
  }

  if (compact) {
    return (
      <Box flexDirection="column" alignItems="center">
        <Text backgroundColor={theme.orange} color={theme.black} bold>
          {" SOURCE DELTA "}
        </Text>
        <Text color={theme.amber} wrap="truncate-end">
          {nodes.map((node) => node.label).join(" ◇ ")}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={theme.orange}>╲       │       ╱</Text>
      <Text backgroundColor={theme.orange} color={theme.black} bold>
        {" SOURCE DELTA "}
      </Text>
      <Text color={theme.orange}>╱       │       ╲</Text>
      {nodes.map((node, index) => (
        <Text key={node.path} color={index % 3 === 0 ? theme.green : theme.amber}>
          {index % 2 === 0 ? "◢" : "◣"} {shortLabel(node.path, Math.max(12, width - 8))}
        </Text>
      ))}
      {state.diff.files.length > nodes.length ? (
        <Text color={theme.dim}>+{state.diff.files.length - nodes.length} MORE NODES</Text>
      ) : null}
    </Box>
  );
}

export function OperationsScreen({
  state,
  columns,
  rows,
}: {
  state: AppState;
  columns: number;
  rows: number;
}): ReactNode {
  const sync = synchronization(state);
  const wide = columns >= 96;
  const compact = rows < 28;
  const traceWidth = Math.max(18, Math.min(52, columns - 42));
  const active = state.activity.at(-1);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box
        borderStyle="single"
        borderColor={sync.percent === 100 ? theme.green : theme.purple}
        flexDirection="column"
        flexShrink={0}
      >
        <Box
          backgroundColor={sync.percent === 100 ? theme.green : theme.purple}
          paddingX={1}
          justifyContent="space-between"
        >
          <Text color={theme.black} bold>同期率 / SYNCHRONIZATION</Text>
          <Text color={theme.black} bold>
            {sync.percent === null ? "NO PLAN" : `${sync.percent.toString().padStart(3, "0")}%`}
          </Text>
        </Box>
        <Box paddingX={1}>
          <Text color={sync.percent === 100 ? theme.green : theme.purple}>
            [{gauge(sync.percent, Math.max(12, Math.min(42, columns - 30)))}]{" "}
            {sync.total === 0 ? "STANDBY" : `${sync.completed}/${sync.total} STAGES`}
          </Text>
        </Box>
      </Box>

      <Box flexDirection={wide ? "row" : "column"} flexGrow={1}>
        <Panel
          title="作戦脊柱 / OPERATION SPINE"
          accent={theme.orange}
          {...(wide ? { width: "34%" } : { flexGrow: 1 })}
        >
          <PlanSpine
            plan={state.plan}
            maxItems={compact ? 3 : Math.max(3, Math.min(7, rows - 19))}
          />
        </Panel>

        <Panel
          title="影響領域 / PROPAGATION FIELD"
          accent={theme.amber}
          {...(wide ? { width: "40%" } : {})}
          flexGrow={1}
        >
          <ImpactField
            state={state}
            width={wide ? Math.floor(columns * 0.4) : columns - 4}
            compact={compact}
          />
        </Panel>

        {wide ? (
          <Panel title="活動信号 / LIVE SIGNAL" accent={theme.cyan} flexGrow={1}>
            <Text color={theme.cyan}>{activityTrace(state.activity, traceWidth)}</Text>
            <Text color={active ? statusColor(active.status) : theme.dim} bold>
              {active ? stateGlyph(active.status) : "○"}{" "}
              {active ? active.type.toUpperCase() : "STANDBY"}
            </Text>
            <Text color={theme.white} wrap="wrap">
              {active ? shortLabel(active.label, 30) : "NO TOOL ACTIVITY"}
            </Text>
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.dim}>WORKSPACE DELTA</Text>
              <Text>
                <Text color={theme.green}>+{state.diff.additions}</Text>
                <Text color={theme.dim}> / </Text>
                <Text color={theme.red}>-{state.diff.deletions}</Text>
                <Text color={theme.dim}> · {state.diff.files.length} FILES</Text>
              </Text>
            </Box>
          </Panel>
        ) : null}
      </Box>

      {!compact ? (
        <Box borderStyle="single" borderColor={theme.dim} paddingX={1} flexShrink={0}>
          <Text color={theme.dim}>COMM / 通信 </Text>
          <Text color={theme.white} wrap="truncate-end">
            {state.transcript.at(-1)?.text || "Link initialized."}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function StationsScreen({
  state,
  audioStatus,
  columns,
  rows,
  selectedIndex,
  phase,
  graphicsBackend,
}: {
  state: AppState;
  audioStatus: string;
  columns: number;
  rows: number;
  selectedIndex: number;
  phase: number;
  graphicsBackend: GraphicsBackend;
}): ReactNode {
  const stations = buildStations(state, audioStatus);
  const normalizedSelection =
    stations.length === 0
      ? 0
      : ((selectedIndex % stations.length) + stations.length) % stations.length;
  const selected = stations[normalizedSelection];
  const ready = stations.filter((station) =>
    ["ready", "complete", "online", "active", "playing", "nominal", "clean"].some((value) =>
      station.status.toLowerCase().includes(value),
    ),
  ).length;
  const canvasColumns = Math.max(24, columns - 6);
  const canvasRows = Math.max(8, Math.min(24, rows - 12));
  const semantic = (
    <SemanticGraphicView
      scene="stations"
      columns={canvasColumns}
      rows={canvasRows}
      phase={phase}
      stations={stations}
      selectedIndex={normalizedSelection}
      state={state}
    />
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box
        backgroundColor={theme.orange}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text color={theme.black} bold>
          観測所網 / {graphicsBackend === "kitty" ? "TIER 3 RIB MATRIX" : "SEMANTIC RIB MATRIX"}
        </Text>
        <Text color={theme.black} bold>
          {ready.toString().padStart(2, "0")} / {stations.length.toString().padStart(2, "0")} NOMINAL
        </Text>
      </Box>

      <Box flexGrow={1} alignItems="center" justifyContent="center">
        {graphicsBackend === "kitty" ? (
          <TerminalGraphicView
            scene="stations"
            columns={canvasColumns}
            rows={canvasRows}
            stations={stations}
            selectedIndex={normalizedSelection}
            fallback={semantic}
          />
        ) : (
          semantic
        )}
      </Box>
      {selected ? (
        <Box
          backgroundColor={statusColor(selected.status)}
          paddingX={1}
          flexShrink={0}
        >
          <Text color={theme.black} bold>
            {stateGlyph(selected.status)} {selected.label}
          </Text>
          <Text color={theme.black}> · {selected.detail} · </Text>
          <Text color={theme.black}>{selected.status}</Text>
          <Text color={theme.black}> · {selected.eventCount} EVENTS · {selected.trace}</Text>
        </Box>
      ) : null}
      <Text color={theme.dim}>↑/↓ INSPECT STATION · SIGNAL GLYPHS ARE RECORDED EVENT STATES</Text>
    </Box>
  );
}

export function ImpactScreen({
  state,
  columns,
}: {
  state: AppState;
  columns: number;
}): ReactNode {
  const nodes = impactNodes(state);
  const directories = new Map<string, typeof nodes>();
  for (const node of nodes) {
    directories.set(node.directory, [...(directories.get(node.directory) ?? []), node]);
  }
  const layers = [...directories.entries()].slice(0, 8);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box borderStyle="double" borderColor={theme.red} paddingX={1} justifyContent="space-between">
        <Text color={theme.red} bold>波及解析 / CHANGE PROPAGATION</Text>
        <Text>
          <Text color={theme.green}>+{state.diff.additions}</Text>
          <Text color={theme.dim}> / </Text>
          <Text color={theme.red}>-{state.diff.deletions}</Text>
          <Text color={theme.amber}> · {nodes.length} TARGETS</Text>
        </Text>
      </Box>

      <Box flexDirection="column" alignItems="center" paddingTop={1}>
        <Text color={theme.red}>╲       ╲       │       ╱       ╱</Text>
        <Text color={theme.orange}>◢━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━◣</Text>
        <Text backgroundColor={theme.red} color={theme.black} bold>
          {" CHANGE EPICENTER / 変更震源 "}
        </Text>
        <Text color={theme.orange}>◥━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━◤</Text>
        <Text color={theme.red}>╱       ╱       │       ╲       ╲</Text>
      </Box>

      {layers.length === 0 ? (
        <Box flexDirection="column" alignItems="center" paddingTop={1}>
          <Text color={theme.dim}>NO DIFF TELEMETRY RECEIVED</Text>
          <Text color={theme.dim}>Run a Codex change or use /simulate tsunami.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" paddingX={Math.max(0, Math.floor(columns * 0.05))}>
          {layers.map(([directory, directoryNodes], index) => (
            <Box key={directory}>
              <Text color={index === 0 ? theme.red : index < 3 ? theme.amber : theme.green}>
                {`WAVE ${String(index + 1).padStart(2, "0")} `}
              </Text>
              <Text color={theme.orange} bold>{shortLabel(directory, 24)}</Text>
              <Text color={theme.dim}> ━━ </Text>
              <Text color={theme.white} wrap="truncate-end">
                {directoryNodes.map((node) => node.label).join(" · ")}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1} borderStyle="single" borderColor={theme.cyan} paddingX={1}>
        <Text color={theme.cyan}>VERIFY SIGNAL </Text>
        <Text color={theme.cyan}>{activityTrace(state.activity, Math.max(16, columns - 40))}</Text>
      </Box>
    </Box>
  );
}

export function TranscriptScreen({
  state,
  rows,
  columns,
}: {
  state: AppState;
  rows: number;
  columns: number;
}): ReactNode {
  return (
    <Panel title="通信記録 / FULL TRANSCRIPT" accent={theme.orange} flexGrow={1}>
      <Transcript
        entries={state.transcript}
        limit={Math.max(3, Math.floor((rows - 10) / 4))}
        maxEntryChars={Math.max(200, Math.floor(columns * 3.2))}
      />
    </Panel>
  );
}

function AlertFrame({
  title,
  subtitle,
  phase,
  children,
  footer,
  simulation = false,
  columns,
}: {
  title: string;
  subtitle: string;
  phase: number;
  children: ReactNode;
  footer: string;
  simulation?: boolean;
  columns: number;
}): ReactNode {
  const pulse = phase % 4 < 2;
  const railWidth = Math.max(24, Math.min(72, columns - 8));
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="double"
      borderColor={pulse ? theme.red : theme.amber}
      paddingX={2}
      justifyContent="space-between"
    >
      <Box flexDirection="column">
        <Text backgroundColor={theme.red} color={theme.black} bold>
          {rail(phase, railWidth, true)}
        </Text>
        {simulation ? (
          <Text backgroundColor={theme.amber} color={theme.black} bold>
            {" 試験 / SIMULATION — NO WORKSPACE ACTION "}
          </Text>
        ) : null}
      </Box>

      <Box flexDirection="column" alignItems="center">
        <Text color={pulse ? theme.red : theme.amber} bold>
          ╱╲╱╲╱╲╱╲╱╲╱╲╱╲
        </Text>
        <Text backgroundColor={pulse ? theme.red : theme.amber} color={theme.black} bold>
          {`  ${title}  `}
        </Text>
        <Text color={theme.white} bold>{subtitle}</Text>
        <Text color={pulse ? theme.red : theme.amber} bold>
          ╲╱╲╱╲╱╲╱╲╱╲╱╲
        </Text>
      </Box>

      {children}

      <Box flexDirection="column">
        <Text color={theme.white} bold>{footer}</Text>
        <Text backgroundColor={theme.red} color={theme.black} bold>
          {rail(phase + 3, railWidth, true)}
        </Text>
      </Box>
    </Box>
  );
}

export function ApprovalOverlay({
  approval,
  phase,
  columns,
}: {
  approval: PendingApproval;
  phase: number;
  columns: number;
}): ReactNode {
  const severity = approvalSeverity(approval);
  return (
    <AlertFrame
      title="警 告 / AUTHORIZATION REQUIRED"
      subtitle={`${approval.kind} · ${severity.level} · RISK CLASS ${severity.code}`}
      phase={phase}
      columns={columns}
      footer="[Y] ACCEPT   [A] SESSION   [N] DECLINE   [ESC] CANCEL TURN"
    >
      <Box flexDirection="column" alignItems="center">
        <Text color={theme.dim}>PROPOSED OPERATION / 対象操作</Text>
        <Box borderStyle="single" borderColor={theme.red} paddingX={1} width="90%">
          <Text color={theme.white} bold wrap="wrap">
            {shortLabel(approval.title, Math.max(30, columns * 2))}
          </Text>
        </Box>
        {approval.detail ? (
          <Box paddingTop={1} width="90%">
            <Text color={theme.amber} wrap="wrap">
              {shortLabel(approval.detail, Math.max(60, columns * 3))}
            </Text>
          </Box>
        ) : null}
      </Box>
    </AlertFrame>
  );
}

export function EarthquakeOverlay({
  state,
  phase,
  simulation,
  synchronizationPercent,
  columns,
  rows,
  graphicsBackend,
}: {
  state: AppState;
  phase: number;
  simulation: boolean;
  synchronizationPercent?: number;
  columns: number;
  rows: number;
  graphicsBackend: GraphicsBackend;
}): ReactNode {
  const failed = [...state.activity]
    .reverse()
    .find((item) => item.status.toLowerCase().includes("fail"));
  const graphicColumns = Math.max(24, columns - 2);
  const graphicRows = Math.max(8, rows - 3);
  const incidentDetail = simulation
    ? "Fixture command failure detected in the simulated execution layer."
    : state.diagnostic || failed?.label || "The active turn ended in a failed state.";
  const semantic = (
    <SemanticGraphicView
      scene="earthquake"
      columns={graphicColumns}
      rows={graphicRows}
      phase={phase}
      incidentDetail={incidentDetail}
      simulation={simulation}
      {...(synchronizationPercent === undefined
        ? {}
        : { synchronizationPercent })}
      state={state}
    />
  );
  return (
    <Box flexDirection="column" height={rows} justifyContent="space-between">
      <Box backgroundColor={simulation ? theme.amber : theme.red} paddingX={1}>
        <Text color={theme.black} bold>
          {simulation
            ? "試験 / SIMULATION — NO WORKSPACE ACTION"
            : "警告 / OPERATION FAILURE DETECTED"}
        </Text>
      </Box>
      {graphicsBackend === "kitty" ? (
        <TerminalGraphicView
          scene="earthquake"
          columns={graphicColumns}
          rows={graphicRows}
          incidentDetail={incidentDetail}
          simulation={simulation}
          fallback={semantic}
        />
      ) : (
        semantic
      )}
      <Text color={theme.dim}>
        [ESC/X] DISMISS · {graphicsBackend === "kitty" ? "KITTY GPU" : "SEMANTIC TUI"} LAYER · INCIDENT INPUT LOCKED
      </Text>
    </Box>
  );
}

export function TsunamiOverlay({
  state,
  phase,
  columns,
  rows,
  graphicsBackend,
}: {
  state: AppState;
  phase: number;
  columns: number;
  rows: number;
  graphicsBackend: GraphicsBackend;
}): ReactNode {
  const graphicColumns = Math.max(24, columns - 2);
  const graphicRows = Math.max(8, rows - 3);
  const semantic = (
    <SemanticGraphicView
      scene="tsunami"
      columns={graphicColumns}
      rows={graphicRows}
      phase={phase}
      state={state}
    />
  );
  return (
    <Box flexDirection="column" height={rows} justifyContent="space-between">
      <Box backgroundColor={theme.amber} paddingX={1}>
        <Text color={theme.black} bold>
          試験 / SIMULATION — NO WORKSPACE ACTION
        </Text>
      </Box>
      {graphicsBackend === "kitty" ? (
        <TerminalGraphicView
          scene="tsunami"
          columns={graphicColumns}
          rows={graphicRows}
          fallback={semantic}
        />
      ) : (
        semantic
      )}
      <Text color={theme.dim}>
        [ESC/X] DISMISS · {graphicsBackend === "kitty" ? "KITTY GPU" : "SEMANTIC TUI"} LAYER · FIXTURE NODES ONLY
      </Text>
    </Box>
  );
}
