import type {
  ActivityItem,
  AppState,
  McpState,
  PendingApproval,
} from "../state/model.js";

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
}

export interface ImpactNode {
  path: string;
  label: string;
  directory: string;
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

export function synchronization(state: AppState): {
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

  const stations: Station[] = [
    {
      id: "codex",
      label: "CODEX CORE",
      detail: state.model,
      status: state.connection === "online" ? "ONLINE" : state.connection.toUpperCase(),
      trace: traceForStatuses([state.connection]),
      eventCount: state.threadId ? 1 : 0,
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
