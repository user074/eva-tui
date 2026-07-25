import {
  asNumber,
  asObject,
  asString,
  stringifyCompact,
  truncate,
  type JsonObject,
  type ServerRequest,
} from "../codex/protocol.js";
import {
  type ActivityItem,
  type AppAction,
  type AppState,
  type PendingApproval,
  type TranscriptEntry,
} from "./model.js";
import {
  recordCodexYield,
  recordOperatorMessage,
} from "./conversation-synchronization.js";

function cap<T>(items: T[], count: number): T[] {
  return items.length > count ? items.slice(-count) : items;
}

function upsertTranscript(
  transcript: TranscriptEntry[],
  entry: TranscriptEntry,
  append = false,
): TranscriptEntry[] {
  const index = transcript.findIndex((item) => item.id === entry.id);
  if (index < 0) {
    return cap([...transcript, entry], 80);
  }
  const next = [...transcript];
  const current = next[index];
  if (!current) {
    return transcript;
  }
  next[index] = {
    ...entry,
    text: append ? `${current.text}${entry.text}` : entry.text,
  };
  return next;
}

function itemLabel(item: JsonObject): string {
  const type = asString(item.type, "activity");
  if (type === "commandExecution") {
    return truncate(asString(item.command, "shell command"), 90);
  }
  if (type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes.length : 0;
    return `${changes} file change${changes === 1 ? "" : "s"}`;
  }
  if (type === "mcpToolCall") {
    return `${asString(item.server, "mcp")} :: ${asString(item.tool, "tool")}`;
  }
  if (type === "dynamicToolCall") {
    return `${asString(item.namespace)}${item.namespace ? " :: " : ""}${asString(item.tool, "tool")}`;
  }
  if (type === "webSearch") {
    return `search: ${truncate(asString(item.query), 70)}`;
  }
  if (type === "imageView") {
    return `view: ${truncate(asString(item.path), 70)}`;
  }
  if (type === "collabAgentToolCall") {
    return `agent: ${asString(item.tool, "collaboration")}`;
  }
  return type.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
}

function normalizeStatus(value: string, fallback: string): string {
  const status = value || fallback;
  if (/^in_?progress$/i.test(status)) return "running";
  if (/^(complete|completed|success|succeeded)$/i.test(status)) return "completed";
  if (/^(fail|failed|error)$/i.test(status)) return "failed";
  return status;
}

function itemTargets(item: JsonObject): string[] {
  const targets = new Set<string>();
  const changes = Array.isArray(item.changes) ? item.changes : [];
  for (const rawChange of changes) {
    const path = asString(asObject(rawChange).path);
    if (path) targets.add(path);
  }
  const actions = Array.isArray(item.commandActions) ? item.commandActions : [];
  for (const rawAction of actions) {
    const path = asString(asObject(rawAction).path);
    if (path) targets.add(path);
  }
  const directPath = asString(item.path);
  if (directPath) targets.add(directPath);
  return [...targets];
}

function upsertActivity(
  activity: ActivityItem[],
  item: JsonObject,
  fallbackStatus: string,
  turnId: string,
): ActivityItem[] {
  const id = asString(item.id);
  const type = asString(item.type);
  if (!id || !type || ["agentMessage", "userMessage", "reasoning", "plan"].includes(type)) {
    return activity;
  }
  const targets = itemTargets(item);
  const nextItem: ActivityItem = {
    id,
    type,
    label: itemLabel(item),
    status: normalizeStatus(asString(item.status), fallbackStatus),
    ...(turnId ? { turnId } : {}),
    ...(targets.length > 0 ? { targets } : {}),
  };
  const index = activity.findIndex((existing) => existing.id === id);
  if (index < 0) {
    return cap([...activity, nextItem], 60);
  }
  const next = [...activity];
  next[index] = nextItem;
  return next;
}

function diffFromChanges(value: unknown): {
  additions: number;
  deletions: number;
  files: string[];
} {
  const changes = Array.isArray(value) ? value : [];
  let additions = 0;
  let deletions = 0;
  const files = new Set<string>();
  for (const rawChange of changes) {
    const change = asObject(rawChange);
    const path = asString(change.path);
    if (path) files.add(path);
    const stats = diffStats(asString(change.diff));
    additions += stats.additions;
    deletions += stats.deletions;
  }
  return { additions, deletions, files: [...files] };
}

function aggregateDiffItems(
  items: AppState["diffItems"],
): AppState["diff"] {
  let additions = 0;
  let deletions = 0;
  const files = new Set<string>();
  for (const diff of Object.values(items)) {
    additions += diff.additions;
    deletions += diff.deletions;
    for (const path of diff.files) files.add(path);
  }
  return { additions, deletions, files: [...files] };
}

export function diffStats(diff: string): {
  additions: number;
  deletions: number;
  files: string[];
} {
  let additions = 0;
  let deletions = 0;
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      const rawPath = line.slice(4).split("\t")[0]?.trim() ?? "";
      const path = rawPath.replace(/^[ab]\//, "");
      if (path && path !== "/dev/null") {
        files.add(path);
      }
    }
  }
  return { additions, deletions, files: [...files] };
}

function approvalFromRequest(request: ServerRequest): PendingApproval | null {
  const { params } = request;
  if (request.method === "item/commandExecution/requestApproval") {
    const command = asString(params.command, "Unspecified command");
    const cwd = asString(params.cwd);
    const reason = asString(params.reason);
    return {
      id: request.id,
      method: request.method,
      kind: "COMMAND",
      title: truncate(command, 100),
      detail: [cwd && `cwd: ${cwd}`, reason].filter(Boolean).join("\n"),
      payload: params,
    };
  }
  if (request.method === "item/fileChange/requestApproval") {
    const changes = Array.isArray(params.changes)
      ? params.changes
      : asObject(params.item).changes;
    return {
      id: request.id,
      method: request.method,
      kind: "FILE CHANGE",
      title: "Codex requests permission to modify the workspace",
      detail: stringifyCompact(changes ?? params, 500),
      payload: params,
    };
  }
  if (request.method === "item/permissions/requestApproval") {
    return {
      id: request.id,
      method: request.method,
      kind: "PERMISSIONS",
      title: asString(params.reason, "Codex requests additional permissions"),
      detail: stringifyCompact(params, 500),
      payload: params,
    };
  }
  return null;
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "connected":
      return {
        ...state,
        connection: "online",
        threadId: action.threadId,
        model: action.model,
        notice: "SYSTEM LINK ESTABLISHED",
        diagnostic: "",
        conversationSynchronization: recordCodexYield(
          state.conversationSynchronization,
          action.at,
        ),
        transcript: upsertTranscript(state.transcript, {
          id: "startup",
          role: "system",
          text: "Codex link established. Type an instruction and press Enter.",
          streaming: false,
        }),
      };
    case "connection-failed":
      return {
        ...state,
        connection: "fault",
        notice: "CONNECTION FAULT",
        diagnostic: action.message,
      };
    case "disconnected":
      return {
        ...state,
        connection: "offline",
        notice: "LINK TERMINATED",
        diagnostic: action.message,
      };
    case "operator-message":
      return {
        ...state,
        conversationSynchronization: recordOperatorMessage(
          state.conversationSynchronization,
          action.at,
          action.text,
        ),
        transcript: upsertTranscript(state.transcript, {
          id: action.id,
          role: "operator",
          text: action.text,
          streaming: false,
        }),
        turn: "running",
        notice: "SYNCHRONIZATION IN PROGRESS",
      };
    case "diagnostic":
      return { ...state, diagnostic: truncate(action.message, 240) };
    case "notice":
      return { ...state, notice: action.message };
    case "server-request": {
      const approval = approvalFromRequest(action.request);
      return approval
        ? { ...state, approval, notice: "APPROVAL REQUIRED" }
        : state;
    }
    case "approval-resolved":
      return {
        ...state,
        approval: null,
        notice:
          action.decision === "accept" || action.decision === "acceptForSession"
            ? "AUTHORIZATION GRANTED"
            : "AUTHORIZATION DENIED",
      };
    case "notification":
      return reduceNotification(
        state,
        action.notification.method,
        action.notification.params,
        action.at,
      );
  }
}

function reduceNotification(
  state: AppState,
  method: string,
  params: JsonObject,
  at: number,
): AppState {
  if (method === "turn/started") {
    const turn = asObject(params.turn);
    return {
      ...state,
      turn: "running",
      turnId: asString(turn.id),
      notice: "SYNCHRONIZATION IN PROGRESS",
      plan: [],
      diff: { additions: 0, deletions: 0, files: [] },
      diffItems: {},
    };
  }

  if (method === "item/agentMessage/delta") {
    const id = asString(params.itemId);
    return {
      ...state,
      transcript: upsertTranscript(
        state.transcript,
        {
          id,
          role: "codex",
          text: asString(params.delta),
          streaming: true,
        },
        true,
      ),
    };
  }

  if (method === "item/started" || method === "item/completed") {
    const item = asObject(params.item);
    const type = asString(item.type);
    const completed = method === "item/completed";
    const turnId = asString(params.turnId, state.turnId);
    let transcript = state.transcript;
    if (type === "agentMessage" && completed) {
      transcript = upsertTranscript(transcript, {
        id: asString(item.id),
        role: "codex",
        text: asString(item.text),
        streaming: false,
      });
    }
    let diffItems = state.diffItems;
    let diff = state.diff;
    if (type === "fileChange" && Array.isArray(item.changes)) {
      const itemId = asString(item.id);
      if (itemId) {
        diffItems = {
          ...diffItems,
          [itemId]: diffFromChanges(item.changes),
        };
        diff = aggregateDiffItems(diffItems);
      }
    }
    return {
      ...state,
      transcript,
      diff,
      diffItems,
      activity: upsertActivity(
        state.activity,
        item,
        completed ? "completed" : "running",
        turnId,
      ),
    };
  }

  if (method === "item/fileChange/patchUpdated") {
    const itemId = asString(params.itemId);
    if (!itemId) return state;
    const diffItems = {
      ...state.diffItems,
      [itemId]: diffFromChanges(params.changes),
    };
    return {
      ...state,
      diffItems,
      diff: aggregateDiffItems(diffItems),
    };
  }

  if (method === "turn/plan/updated") {
    const rawPlan = Array.isArray(params.plan) ? params.plan : [];
    return {
      ...state,
      plan: rawPlan.map((entry) => {
        const item = asObject(entry);
        return {
          step: asString(item.step, asString(item.text, "plan step")),
          status: /^in_?progress$/i.test(asString(item.status))
            ? "in_progress"
            : asString(item.status, "pending"),
        };
      }),
    };
  }

  if (method === "turn/diff/updated") {
    return { ...state, diff: diffStats(asString(params.diff)) };
  }

  if (method === "thread/tokenUsage/updated") {
    const tokenUsage = asObject(params.tokenUsage);
    const total = asObject(tokenUsage.total);
    return {
      ...state,
      tokens: {
        total: asNumber(total.totalTokens),
        input: asNumber(total.inputTokens),
        output: asNumber(total.outputTokens),
        contextWindow: asNumber(tokenUsage.modelContextWindow),
      },
    };
  }

  if (method === "mcpServer/startupStatus/updated") {
    const name = asString(params.name, "unknown");
    const next = state.mcp.filter((server) => server.name !== name);
    next.push({ name, status: asString(params.status, "unknown") });
    return { ...state, mcp: next.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  if (method === "error") {
    const error = asObject(params.error);
    return {
      ...state,
      turn: "failed",
      notice: "SYSTEM ERROR",
      diagnostic: asString(error.message, stringifyCompact(params)),
      conversationSynchronization: recordCodexYield(
        state.conversationSynchronization,
        at,
      ),
    };
  }

  if (method === "warning" || method === "configWarning" || method === "deprecationNotice") {
    return {
      ...state,
      diagnostic: asString(params.message, stringifyCompact(params)),
    };
  }

  if (method === "turn/completed") {
    const turn = asObject(params.turn);
    const rawStatus = asString(turn.status, "completed");
    const interrupted = rawStatus.includes("interrupt") || rawStatus === "cancelled";
    const failed = rawStatus.includes("fail") || rawStatus === "error";
    return {
      ...state,
      turn: failed ? "failed" : interrupted ? "interrupted" : "complete",
      turnId: asString(turn.id, state.turnId),
      notice: failed ? "OPERATION FAILED" : interrupted ? "OPERATION INTERRUPTED" : "OPERATION COMPLETE",
      transcript: state.transcript.map((entry) => ({ ...entry, streaming: false })),
      conversationSynchronization: recordCodexYield(
        state.conversationSynchronization,
        at,
      ),
    };
  }

  return state;
}
