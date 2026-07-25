import type {
  ActivityItem,
  AppState,
  McpState,
  PendingApproval,
} from "../state/model.js";
import { conversationSynchronizationAt } from "../state/conversation-synchronization.js";

export const SCENES = ["operations", "stations", "impact", "transcript"] as const;
export type Scene = (typeof SCENES)[number];
export type Simulation = "earthquake" | "tsunami";

export interface Station {
  id: string;
  label: string;
  detail: string;
  status: string;
  trace: string;
  eventCount: number;
  recent?: string[];
}

export interface ImpactNode {
  path: string;
  label: string;
  directory: string;
}

export interface PropagationNode extends ImpactNode {
  kind: "WRITE" | "READ" | "SIGNAL";
}

export interface OperationSpine {
  source: "plan" | "live";
  steps: AppState["plan"];
}

const STATUS_GLYPHS = {
  completed: "▃",
  running: "▇",
  failed: "█",
  waiting: "▁",
} as const;

export function cycleScene(
  current: Scene,
  direction: 1 | -1 = 1,
): Scene {
  const index = SCENES.indexOf(current);
  return SCENES[(index + direction + SCENES.length) % SCENES.length] ?? "operations";
}

export function planProgress(state: AppState): {
  completed: number;
  total: number;
  percent: number | null;
} {
  const completed = state.plan.filter((step) => step.status === "completed").length;
  return {
    completed,
    total: state.plan.length,
    percent:
      state.plan.length === 0
        ? null
        : Math.round((completed / state.plan.length) * 100),
  };
}

export function conversationSynchronization(
  state: AppState,
  now: number,
): ReturnType<typeof conversationSynchronizationAt> {
  return conversationSynchronizationAt(
    state.conversationSynchronization,
    now,
  );
}

export function currentTurnActivities(state: AppState): ActivityItem[] {
  if (!state.turnId) return [];
  return state.activity.filter((item) => item.turnId === state.turnId);
}

function terminalTurn(state: AppState): boolean {
  return ["complete", "interrupted", "failed"].includes(state.turn);
}

export function operationSpine(state: AppState): OperationSpine {
  if (state.plan.length > 0) {
    return { source: "plan", steps: state.plan };
  }

  const hasDirective = state.transcript.some((entry) => entry.role === "operator");
  if (!hasDirective && state.turn === "idle") {
    return { source: "live", steps: [] };
  }

  const activities = currentTurnActivities(state);
  const hasActivity = activities.length > 0;
  const activityRunning = activities.some((item) =>
    /run|progress|start|active/i.test(item.status),
  );
  const codexStreaming = state.transcript.some(
    (entry) => entry.role === "codex" && entry.streaming,
  );
  const finished = terminalTurn(state);
  const failed = state.turn === "failed";
  const synthesisActive =
    state.turn === "running" &&
    (codexStreaming || (hasActivity && !activityRunning));

  return {
    source: "live",
    steps: [
      {
        step: "DIRECTIVE ACQUIRED",
        status: hasDirective ? "completed" : "in_progress",
      },
      {
        step: "ASSESS REQUEST",
        status:
          hasActivity || codexStreaming || finished
            ? "completed"
            : state.turn === "running"
              ? "in_progress"
              : "pending",
      },
      {
        step: hasActivity ? "OPERATE SYSTEMS" : "DIRECT RESPONSE PATH",
        status: failed
          ? "failed"
          : activityRunning
            ? "in_progress"
            : hasActivity || codexStreaming || finished
              ? "completed"
              : "pending",
      },
      {
        step: "SYNTHESIZE RESPONSE",
        status: failed
          ? "failed"
          : finished
            ? "completed"
            : synthesisActive || codexStreaming
              ? "in_progress"
              : "pending",
      },
      {
        step: "RETURN CONTROL",
        status: failed
          ? "failed"
          : finished
            ? "completed"
            : "pending",
      },
    ],
  };
}

function statusKind(status: string): keyof typeof STATUS_GLYPHS {
  const value = status.toLowerCase();
  if (value.includes("fail") || value.includes("error") || value.includes("declin")) {
    return "failed";
  }
  if (
    value.includes("complete") ||
    value.includes("success") ||
    value.includes("ready") ||
    value.includes("online")
  ) {
    return "completed";
  }
  if (
    value.includes("run") ||
    value.includes("progress") ||
    value.includes("start") ||
    value.includes("active")
  ) {
    return "running";
  }
  return "waiting";
}

function traceForStatuses(statuses: string[], width = 12): string {
  const glyphs = statuses.map((status) => STATUS_GLYPHS[statusKind(status)]);
  return `${"─".repeat(Math.max(0, width - glyphs.length))}${glyphs
    .slice(-width)
    .join("")}`;
}

function latestStatus(items: ActivityItem[], fallback = "STANDBY"): string {
  return items.at(-1)?.status.toUpperCase() ?? fallback;
}

function activityStation(
  id: string,
  label: string,
  detail: string,
  items: ActivityItem[],
): Station {
  return {
    id,
    label,
    detail,
    status: latestStatus(items),
    trace: traceForStatuses(items.map((item) => item.status)),
    eventCount: items.length,
    recent: items.slice(-3).map((item) => item.label),
  };
}

function mcpStation(server: McpState): Station {
  return {
    id: `mcp:${server.name}`,
    label: server.name.toUpperCase(),
    detail: "MCP EXTERNAL LINK",
    status: server.status.toUpperCase(),
    trace: traceForStatuses([server.status]),
    eventCount: 1,
  };
}

export function buildStations(state: AppState, audioStatus: string): Station[] {
  const commands = state.activity.filter((item) => item.type === "commandExecution");
  const git = commands.filter((item) => /(^|[\s/])git(?:\s|$)/i.test(item.label));
  const shell = commands.filter((item) => !git.includes(item));
  const workspace = state.activity.filter((item) => item.type === "fileChange");
  const tools = state.activity.filter((item) =>
    ["dynamicToolCall", "mcpToolCall", "webSearch", "imageView"].includes(item.type),
  );
  const agents = state.activity.filter((item) => item.type === "collabAgentToolCall");
  const spine = operationSpine(state);
  const completedSpineSteps = spine.steps.filter(
    (step) => step.status === "completed",
  ).length;
  const contextPercent =
    state.tokens.contextWindow > 0
      ? Math.round((state.tokens.total / state.tokens.contextWindow) * 100)
      : 0;

  const stations: Station[] = [
    {
      id: "codex",
      label: "CODEX CORE",
      detail: state.model,
      status: state.connection === "online" ? "ONLINE" : state.connection.toUpperCase(),
      trace: traceForStatuses([state.connection]),
      eventCount: state.threadId ? 1 : 0,
      recent: state.notice ? [state.notice] : [],
    },
    activityStation("shell", "SHELL-01", "COMMAND EXECUTION", shell),
    activityStation("git", "GIT CONTROL", "VERSION OPERATIONS", git),
    activityStation("workspace", "WORKSPACE", "FILE CHANGE LINK", workspace),
    activityStation("tools", "TOOL BUS", "DYNAMIC OPERATIONS", tools),
    activityStation("agents", "AGENT LINK", "COLLABORATION BUS", agents),
    {
      id: "audio",
      label: "AUDIO",
      detail: "AMBIENT CONTROL",
      status: audioStatus,
      trace: traceForStatuses([audioStatus === "OFF" ? "waiting" : "active"]),
      eventCount: audioStatus === "OFF" ? 0 : 1,
      recent: [audioStatus],
    },
    {
      id: "thread",
      label: "THREAD CORE",
      detail: state.threadId ? state.threadId.slice(0, 12) : "UNASSIGNED",
      status:
        state.turn === "failed"
          ? "FAILED"
          : state.turn === "running"
            ? "ACTIVE"
            : state.connection === "online"
              ? "READY"
              : "STANDBY",
      trace: traceForStatuses([state.turn]),
      eventCount: state.transcript.length,
      recent: state.transcript.slice(-2).map((entry) => entry.text),
    },
    {
      id: "plan",
      label: "OPERATION SPINE",
      detail: `${completedSpineSteps}/${spine.steps.length} ${spine.source === "plan" ? "PLAN" : "LIVE"} STEPS`,
      status:
        spine.steps.length === 0
          ? "STANDBY"
          : completedSpineSteps === spine.steps.length
            ? "COMPLETE"
            : state.turn === "running"
              ? "ACTIVE"
              : "WAITING",
      trace: traceForStatuses(spine.steps.map((step) => step.status)),
      eventCount: spine.steps.length,
      recent: spine.steps.slice(-3).map((step) => step.step),
    },
    {
      id: "context",
      label: "CONTEXT",
      detail: `${contextPercent}% WINDOW`,
      status: contextPercent >= 85 ? "CAUTION" : "NOMINAL",
      trace: traceForStatuses([contextPercent >= 85 ? "running" : "ready"]),
      eventCount: state.tokens.total,
      recent: [`${state.tokens.total} TOKENS`],
    },
    {
      id: "diff",
      label: "DIFF FIELD",
      detail: `+${state.diff.additions}/-${state.diff.deletions}`,
      status: state.diff.files.length > 0 ? "CHANGED" : "CLEAN",
      trace: traceForStatuses([
        state.diff.files.length > 0 ? "running" : "ready",
      ]),
      eventCount: state.diff.files.length,
      recent: state.diff.files.slice(-3),
    },
    {
      id: "approval",
      label: "APPROVAL GATE",
      detail: "OPERATOR AUTHORIZATION",
      status: state.approval ? "AWAITING" : "READY",
      trace: traceForStatuses([state.approval ? "running" : "ready"]),
      eventCount: state.approval ? 1 : 0,
      recent: state.approval ? [state.approval.title] : [],
    },
    ...state.mcp.map(mcpStation),
  ];

  return stations.slice(0, 14);
}

export function activityTrace(items: ActivityItem[], width = 36): string {
  return traceForStatuses(
    items.map((item) => item.status),
    width,
  );
}

export function impactNodes(state: AppState): ImpactNode[] {
  return state.diff.files.map((path) => {
    const parts = path.split("/");
    return {
      path,
      label: parts.at(-1) ?? path,
      directory: parts.length > 1 ? parts.slice(0, -1).join("/") : ".",
    };
  });
}

function propagationNode(path: string, kind: PropagationNode["kind"]): PropagationNode {
  const parts = path.split("/");
  return {
    path,
    label: parts.at(-1) ?? path,
    directory: parts.length > 1 ? parts.slice(0, -1).join("/") : ".",
    kind,
  };
}

function signalLabel(item: ActivityItem): string {
  if (item.type === "commandExecution") return "SHELL CHANNEL";
  if (item.type === "fileChange") return "WORKSPACE WRITE";
  if (item.type === "webSearch") return "NETWORK SEARCH";
  if (item.type === "mcpToolCall") return "MCP LINK";
  if (item.type === "dynamicToolCall") return "TOOL BUS";
  if (item.type === "collabAgentToolCall") return "AGENT LINK";
  if (item.type === "imageView") return "IMAGE SENSOR";
  return item.type.replaceAll(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

export function propagationNodes(state: AppState): PropagationNode[] {
  const nodes = new Map<string, PropagationNode>();
  for (const path of state.diff.files) {
    nodes.set(path, propagationNode(path, "WRITE"));
  }

  const activities = currentTurnActivities(state);
  for (const item of activities) {
    for (const path of item.targets ?? []) {
      if (!nodes.has(path)) {
        nodes.set(
          path,
          propagationNode(path, item.type === "fileChange" ? "WRITE" : "READ"),
        );
      }
    }
  }

  if (nodes.size === 0) {
    for (const item of activities) {
      const label = signalLabel(item);
      const key = `signal:${item.type}`;
      nodes.set(key, {
        path: key,
        label,
        directory: "LIVE CHANNEL",
        kind: "SIGNAL",
      });
    }
  }

  if (nodes.size === 0 && state.turn === "running") {
    nodes.set("signal:model", {
      path: "signal:model",
      label: "MODEL SYNTHESIS",
      directory: "CODEX CORE",
      kind: "SIGNAL",
    });
  } else if (nodes.size === 0 && terminalTurn(state)) {
    nodes.set("signal:response", {
      path: "signal:response",
      label: state.turn === "failed" ? "FAULT RETURNED" : "RESPONSE DELIVERED",
      directory: "COMM",
      kind: "SIGNAL",
    });
  }

  return [...nodes.values()];
}

export function approvalSeverity(approval: PendingApproval): {
  level: "ELEVATED" | "HIGH" | "CRITICAL";
  code: "R-01" | "R-02" | "R-03";
} {
  const text = `${approval.title}\n${approval.detail}`.toLowerCase();
  if (
    approval.kind === "PERMISSIONS" ||
    /\b(rm|delete|sudo|force|overwrite|recursive)\b/.test(text)
  ) {
    return { level: "CRITICAL", code: "R-03" };
  }
  if (approval.kind === "FILE CHANGE") {
    return { level: "HIGH", code: "R-02" };
  }
  return { level: "ELEVATED", code: "R-01" };
}

export function shortLabel(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return "…";
  return `${value.slice(0, width - 1)}…`;
}
