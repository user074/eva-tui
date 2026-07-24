import type { ReactNode } from "react";
import { Box, Text } from "ink";

import type {
  ActivityItem,
  AppState,
  PendingApproval,
  PlanStep,
  TranscriptEntry,
} from "../state/model.js";
import { statusColor, theme } from "./theme.js";

export function Panel({
  title,
  accent = theme.orange,
  children,
  flexGrow,
  width,
}: {
  title: string;
  accent?: string;
  children: ReactNode;
  flexGrow?: number;
  width?: number | string;
}): ReactNode {
  return (
    <Box
      borderStyle="single"
      borderColor={accent}
      flexDirection="column"
      paddingX={1}
      flexGrow={flexGrow}
      width={width}
    >
      <Text color={accent} bold>
        {title}
      </Text>
      {children}
    </Box>
  );
}

export function Header({
  state,
  audio,
  phase,
}: {
  state: AppState;
  audio: string;
  phase: number;
}): ReactNode {
  const live = state.connection === "online";
  const running = state.turn === "running";
  const alert = state.approval !== null || state.turn === "failed";
  const stripe = Array.from({ length: 7 }, (_, index) =>
    (index + phase) % 2 === 0 ? "///" : "\\\\\\",
  ).join("");

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text color={theme.orange} bold>
          EVA://CODEX <Text color={theme.purple}>OPERATIONAL INTERFACE</Text>
        </Text>
        <Text color={live ? theme.green : theme.red} bold>
          {live ? "● 接続 ONLINE" : "● 切断 OFFLINE"}
        </Text>
      </Box>
      <Box justifyContent="space-between">
        <Text color={alert ? theme.red : running ? theme.orange : theme.dim}>
          {alert ? stripe : "─────────────────────"} {state.notice}
        </Text>
        <Text color={audio === "OFF" ? theme.dim : theme.cyan}>
          AUDIO {audio}
        </Text>
      </Box>
    </Box>
  );
}

function roleLabel(entry: TranscriptEntry): {
  label: string;
  color: string;
} {
  if (entry.role === "operator") {
    return { label: "操作者 / YOU", color: theme.cyan };
  }
  if (entry.role === "codex") {
    return { label: "CODEX / 応答", color: theme.orange };
  }
  return { label: "SYSTEM / 管制", color: theme.purple };
}

export function Transcript({
  entries,
  limit,
  maxEntryChars,
}: {
  entries: TranscriptEntry[];
  limit: number;
  maxEntryChars: number;
}): ReactNode {
  const visible = entries.slice(-limit);
  const compactText = (text: string): string => {
    if (text.length <= maxEntryChars) {
      return text;
    }
    const head = Math.floor(maxEntryChars * 0.62);
    const tail = maxEntryChars - head;
    return `${text.slice(0, head)}\n…\n${text.slice(-tail)}`;
  };
  return (
    <Box flexDirection="column">
      {visible.map((entry) => {
        const role = roleLabel(entry);
        return (
          <Box key={entry.id} flexDirection="column" marginBottom={1}>
            <Text color={role.color} bold>
              {role.label} {entry.streaming ? "▌" : ""}
            </Text>
            <Text color={theme.white} wrap="wrap">
              {compactText(entry.text) || "…"}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function CompactTelemetry({ state }: { state: AppState }): ReactNode {
  const completed = state.plan.filter((step) => step.status === "completed").length;
  const plan = state.plan.length > 0 ? `${completed}/${state.plan.length}` : "--";
  const readyMcp = state.mcp.filter((server) =>
    ["ready", "started", "complete"].some((value) =>
      server.status.toLowerCase().includes(value),
    ),
  ).length;
  const latest = state.activity.at(-1);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.purple}>SYNC {plan}</Text>
        <Text color={theme.dim}> │ </Text>
        <Text color={theme.cyan}>TOK {state.tokens.total.toLocaleString()}</Text>
        <Text color={theme.dim}> │ </Text>
        <Text color={theme.green}>+{state.diff.additions}</Text>
        <Text color={theme.red}> -{state.diff.deletions}</Text>
        <Text color={theme.dim}> │ </Text>
        <Text color={theme.purple}>MCP {readyMcp}/{state.mcp.length}</Text>
      </Text>
      <Text color={latest ? statusColor(latest.status) : theme.dim} wrap="truncate-end">
        {latest ? `▶ ${latest.type.toUpperCase()} ${latest.label}` : "ACTIVITY STANDBY"}
      </Text>
    </Box>
  );
}

function planGauge(plan: PlanStep[]): { label: string; gauge: string; color: string } {
  if (plan.length === 0) {
    return { label: "NO PLAN TELEMETRY", gauge: "░░░░░░░░░░░░", color: theme.dim };
  }
  const completed = plan.filter((step) => step.status === "completed").length;
  const active = plan.some((step) => step.status === "in_progress");
  const cells = Math.round((completed / plan.length) * 12);
  return {
    label: `${completed}/${plan.length} STAGES`,
    gauge: `${"█".repeat(cells)}${"░".repeat(12 - cells)}`,
    color: completed === plan.length ? theme.green : active ? theme.orange : theme.dim,
  };
}

export function Telemetry({ state }: { state: AppState }): ReactNode {
  const plan = planGauge(state.plan);
  const contextPercent =
    state.tokens.contextWindow > 0
      ? Math.min(100, Math.round((state.tokens.total / state.tokens.contextWindow) * 100))
      : null;
  const readyMcp = state.mcp.filter((server) =>
    ["ready", "started", "complete"].some((value) =>
      server.status.toLowerCase().includes(value),
    ),
  ).length;

  return (
    <Box flexDirection="column">
      <Text color={theme.dim}>SYNCHRONIZATION / 同期</Text>
      <Text color={plan.color} bold>
        [{plan.gauge}] {plan.label}
      </Text>
      {state.plan.slice(-4).map((step, index) => (
        <Text key={`${step.step}-${index}`} color={statusColor(step.status)}>
          {step.status === "completed" ? "■" : step.status === "in_progress" ? "▶" : "□"}{" "}
          {step.step}
        </Text>
      ))}

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>CONTEXT LOAD / 文脈</Text>
        <Text color={contextPercent !== null && contextPercent > 85 ? theme.red : theme.cyan}>
          {state.tokens.total.toLocaleString()} TOKENS
          {contextPercent === null ? " / WINDOW UNKNOWN" : ` / ${contextPercent}%`}
        </Text>
        <Text color={theme.dim}>
          IN {state.tokens.input.toLocaleString()}  OUT {state.tokens.output.toLocaleString()}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>WORKSPACE DELTA / 変更</Text>
        <Text>
          <Text color={theme.green}>+{state.diff.additions}</Text>
          <Text color={theme.dim}> / </Text>
          <Text color={theme.red}>-{state.diff.deletions}</Text>
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>MCP LINKS / 外部接続</Text>
        <Text color={state.mcp.length === 0 ? theme.dim : theme.purple}>
          {readyMcp}/{state.mcp.length} READY
        </Text>
      </Box>
    </Box>
  );
}

export function Activity({ items }: { items: ActivityItem[] }): ReactNode {
  if (items.length === 0) {
    return <Text color={theme.dim}>No tool activity.</Text>;
  }
  return (
    <Box flexDirection="column">
      {items.slice(-6).map((item) => (
        <Text key={item.id} color={statusColor(item.status)}>
          {item.status === "completed" ? "■" : item.status === "failed" ? "!" : "▶"}{" "}
          <Text color={theme.dim}>{item.type.toUpperCase()}</Text> {item.label}
        </Text>
      ))}
    </Box>
  );
}

export function Approval({ approval, phase }: { approval: PendingApproval; phase: number }): ReactNode {
  const warning = phase % 2 === 0 ? "警 告" : "承 認";
  return (
    <Box borderStyle="double" borderColor={theme.red} paddingX={1} flexDirection="column">
      <Box justifyContent="space-between">
        <Text backgroundColor={theme.red} color={theme.black} bold>
          {" "}{warning} / APPROVAL REQUIRED{" "}
        </Text>
        <Text color={theme.red} bold>{approval.kind}</Text>
      </Box>
      <Text color={theme.white} bold>{approval.title}</Text>
      {approval.detail ? <Text color={theme.amber}>{approval.detail}</Text> : null}
      <Text color={theme.red} bold>
        [Y] ACCEPT  [A] SESSION  [N] DECLINE  [ESC] CANCEL TURN
      </Text>
    </Box>
  );
}
