import type { ReactNode } from "react";
import { Box, Text } from "ink";

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
  type Station,
} from "./operations-model.js";
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
        borderStyle="double"
        borderColor={sync.percent === 100 ? theme.green : theme.purple}
        paddingX={1}
        flexDirection="column"
        flexShrink={0}
      >
        <Box justifyContent="space-between">
          <Text color={theme.purple} bold>同期率 / SYNCHRONIZATION</Text>
          <Text color={sync.percent === 100 ? theme.green : theme.orange} bold>
            {sync.percent === null ? "NO PLAN" : `${sync.percent.toString().padStart(3, "0")}%`}
          </Text>
        </Box>
        <Text color={sync.percent === 100 ? theme.green : theme.purple}>
          [{gauge(sync.percent, Math.max(12, Math.min(42, columns - 30)))}]{" "}
          {sync.total === 0 ? "STANDBY" : `${sync.completed}/${sync.total} STAGES`}
        </Text>
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

function StationNode({
  station,
  side,
  width,
  selected,
}: {
  station: Station;
  side: "left" | "right";
  width: number;
  selected: boolean;
}): ReactNode {
  const color = statusColor(station.status);
  const label = shortLabel(station.label, Math.max(8, width - 8));
  return (
    <Box width={width} flexDirection="column" alignItems={side === "left" ? "flex-end" : "flex-start"}>
      <Text
        color={selected ? theme.black : color}
        bold
        {...(selected ? { backgroundColor: color } : {})}
      >
        {side === "left"
          ? `${label} ${stateGlyph(station.status)} ◢`
          : `◣ ${stateGlyph(station.status)} ${label}`}
      </Text>
      <Text color={theme.dim}>
        {side === "left"
          ? `${station.trace} ${shortLabel(station.status, 10)}`
          : `${shortLabel(station.status, 10)} ${station.trace}`}
      </Text>
    </Box>
  );
}

export function StationsScreen({
  state,
  audioStatus,
  columns,
  rows,
  selectedIndex,
}: {
  state: AppState;
  audioStatus: string;
  columns: number;
  rows: number;
  selectedIndex: number;
}): ReactNode {
  const stations = buildStations(state, audioStatus);
  const normalizedSelection =
    stations.length === 0
      ? 0
      : ((selectedIndex % stations.length) + stations.length) % stations.length;
  const selected = stations[normalizedSelection];
  const ready = stations.filter((station) =>
    ["ready", "complete", "online", "active", "playing"].some((value) =>
      station.status.toLowerCase().includes(value),
    ),
  ).length;
  const pairs = Array.from({ length: Math.ceil(stations.length / 2) }, (_, index) => [
    stations[index * 2],
    stations[index * 2 + 1],
  ] as const);
  const wide = columns >= 76;
  const compact = rows < 30;
  const nodeWidth = Math.max(24, Math.floor((columns - 15) / 2));

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box borderStyle="double" borderColor={theme.orange} paddingX={1} justifyContent="space-between">
        <Text color={theme.orange} bold>観測所網 / STATION MATRIX</Text>
        <Text color={ready === stations.length ? theme.green : theme.amber} bold>
          {ready.toString().padStart(2, "0")} / {stations.length.toString().padStart(2, "0")} NOMINAL
        </Text>
      </Box>

      {wide ? (
        <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={1}>
          <Text color={theme.orange} bold>┏━ CODEX SIGNAL SPINE ━┓</Text>
          {pairs.map(([left, right], index) => (
            <Box key={`${left?.id ?? "none"}-${right?.id ?? "none"}`} alignItems="center">
              {left && !compact ? (
                <StationNode
                  station={left}
                  side="left"
                  width={nodeWidth}
                  selected={left.id === selected?.id}
                />
              ) : left ? (
                <Box width={nodeWidth} justifyContent="flex-end">
                  <Text
                    color={left.id === selected?.id ? theme.black : statusColor(left.status)}
                    bold
                    {...(left.id === selected?.id
                      ? { backgroundColor: statusColor(left.status) }
                      : {})}
                  >
                    {shortLabel(left.label, nodeWidth - 5)} {stateGlyph(left.status)} ◢
                  </Text>
                </Box>
              ) : (
                <Box width={nodeWidth} />
              )}
              <Text color={index % 2 === 0 ? theme.orange : theme.purple}>
                ━━━╲┃╱━━━
              </Text>
              {right && !compact ? (
                <StationNode
                  station={right}
                  side="right"
                  width={nodeWidth}
                  selected={right.id === selected?.id}
                />
              ) : right ? (
                <Box width={nodeWidth}>
                  <Text
                    color={right.id === selected?.id ? theme.black : statusColor(right.status)}
                    bold
                    {...(right.id === selected?.id
                      ? { backgroundColor: statusColor(right.status) }
                      : {})}
                  >
                    ◣ {stateGlyph(right.status)} {shortLabel(right.label, nodeWidth - 5)}
                  </Text>
                </Box>
              ) : (
                <Box width={nodeWidth} />
              )}
            </Box>
          ))}
          <Text color={theme.orange} bold>┗━━━━━━━┻━━━━━━━┛</Text>
        </Box>
      ) : (
        <Box flexDirection="column" paddingX={1}>
          {stations.map((station) => (
            <Box key={station.id} justifyContent="space-between">
              <Text
                color={station.id === selected?.id ? theme.black : statusColor(station.status)}
                bold
                {...(station.id === selected?.id
                  ? { backgroundColor: statusColor(station.status) }
                  : {})}
              >
                {stateGlyph(station.status)} {shortLabel(station.label, 18)}
              </Text>
              <Text color={theme.dim}>{station.trace} {station.status}</Text>
            </Box>
          ))}
        </Box>
      )}
      {selected ? (
        <Box borderStyle="single" borderColor={statusColor(selected.status)} paddingX={1} flexShrink={0}>
          <Text color={statusColor(selected.status)} bold>
            {stateGlyph(selected.status)} {selected.label}
          </Text>
          <Text color={theme.dim}> · {selected.detail} · </Text>
          <Text color={theme.white}>{selected.status}</Text>
          <Text color={theme.dim}> · {selected.eventCount} EVENTS · {selected.trace}</Text>
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
  columns,
}: {
  state: AppState;
  phase: number;
  simulation: boolean;
  columns: number;
}): ReactNode {
  const failed = [...state.activity]
    .reverse()
    .find((item) => item.status.toLowerCase().includes("fail"));
  return (
    <AlertFrame
      title="警 告 / EARTHQUAKE"
      subtitle={simulation ? "LOCAL INCIDENT TEST" : "OPERATION FAILURE DETECTED"}
      phase={phase}
      columns={columns}
      simulation={simulation}
      footer="[ESC/X] DISMISS   [TAB] LOCKED DURING INCIDENT"
    >
      <Box flexDirection="column" alignItems="center">
        <Box>
          <Box borderStyle="double" borderColor={theme.red} paddingX={2} flexDirection="column" alignItems="center">
            <Text color={theme.dim}>{simulation ? "MAGNITUDE" : "TURN STATUS"}</Text>
            <Text color={theme.red} bold>{simulation ? "6.2" : "FAILED"}</Text>
          </Box>
          <Box marginLeft={2} borderStyle="double" borderColor={theme.amber} paddingX={2} flexDirection="column" alignItems="center">
            <Text color={theme.dim}>{simulation ? "DEPTH" : "FAILED TOOL"}</Text>
            <Text color={theme.amber} bold>{simulation ? "03 LEVELS" : shortLabel(failed?.type.toUpperCase() ?? "CODEX", 18)}</Text>
          </Box>
        </Box>
        <Text color={theme.red}>
          {simulation
            ? "TEST SIGNAL  ▁▂▃▅▇█▅▂▁▃█▇▃▁"
            : `EVENT SIGNAL ${activityTrace(state.activity, 20)}`}
        </Text>
        <Text color={theme.white} wrap="wrap">
          {simulation
            ? "Fixture command failure detected in the simulated execution layer."
            : state.diagnostic || failed?.label || "The active turn ended in a failed state."}
        </Text>
      </Box>
    </AlertFrame>
  );
}

export function TsunamiOverlay({
  phase,
  columns,
}: {
  phase: number;
  columns: number;
}): ReactNode {
  return (
    <AlertFrame
      title="津 波 / PROPAGATION ALERT"
      subtitle="CHANGE BLAST-RADIUS TEST"
      phase={phase}
      columns={columns}
      simulation
      footer="[ESC/X] DISMISS   TEST NODES ARE FIXTURES"
    >
      <Box flexDirection="column" alignItems="center">
        <Text color={theme.red}>              ◇ src/core.ts</Text>
        <Text color={theme.red}>          ╱━━━━━━╋━━━━━━╲</Text>
        <Text color={theme.amber}>    ◇ api.ts    ┃    ◇ state.ts</Text>
        <Text color={theme.amber}>       ╲        ┃        ╱</Text>
        <Text color={theme.orange}>    WAVE 01 ━━━╋━━━ DIRECT DEPENDENTS</Text>
        <Text color={theme.orange}>            ╱  ┃  ╲</Text>
        <Text color={theme.green}>      ◇ cli.ts ◇ tests ◇ ui.tsx</Text>
        <Text color={theme.green}>    WAVE 02 ━━━╋━━━ VERIFICATION TARGETS</Text>
        <Text color={theme.red}>POTENTIAL PROPAGATION · 06 FIXTURE NODES · 02 WAVES</Text>
      </Box>
    </AlertFrame>
  );
}
