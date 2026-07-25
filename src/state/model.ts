import type {
  ApprovalDecision,
  CodexNotification,
  JsonObject,
  RequestId,
  ServerRequest,
} from "../codex/protocol.js";

export type ConnectionState =
  | "booting"
  | "online"
  | "offline"
  | "fault";
export type TurnState = "idle" | "running" | "complete" | "interrupted" | "failed";

export interface TranscriptEntry {
  id: string;
  role: "operator" | "codex" | "system";
  text: string;
  streaming: boolean;
}

export interface ActivityItem {
  id: string;
  type: string;
  label: string;
  status: string;
  turnId?: string;
  targets?: string[];
}

export interface PlanStep {
  step: string;
  status: string;
}

export interface TokenState {
  total: number;
  input: number;
  output: number;
  contextWindow: number;
}

export interface DiffState {
  additions: number;
  deletions: number;
  files: string[];
}

export type DiffItemsState = Record<string, DiffState>;

export interface McpState {
  name: string;
  status: string;
}

export interface ConversationSynchronizationState {
  percent: number;
  updatedAt: number | null;
  awaitingHumanSince: number | null;
  lastResponseMs: number | null;
  exchanges: number;
  lastInputWords: number;
  lastInputIncrease: number;
}

export interface PendingApproval {
  id: RequestId;
  method: string;
  kind: "COMMAND" | "FILE CHANGE" | "PERMISSIONS";
  title: string;
  detail: string;
  payload: JsonObject;
}

export interface AppState {
  connection: ConnectionState;
  model: string;
  threadId: string;
  turnId: string;
  turn: TurnState;
  transcript: TranscriptEntry[];
  activity: ActivityItem[];
  plan: PlanStep[];
  tokens: TokenState;
  diff: DiffState;
  diffItems: DiffItemsState;
  mcp: McpState[];
  conversationSynchronization: ConversationSynchronizationState;
  approval: PendingApproval | null;
  notice: string;
  diagnostic: string;
}

export type AppAction =
  | { type: "connected"; threadId: string; model: string; at: number }
  | { type: "connection-failed"; message: string }
  | { type: "disconnected"; message: string }
  | { type: "operator-message"; id: string; text: string; at: number }
  | { type: "notification"; notification: CodexNotification; at: number }
  | { type: "server-request"; request: ServerRequest }
  | { type: "approval-resolved"; decision: ApprovalDecision }
  | { type: "diagnostic"; message: string }
  | { type: "notice"; message: string };

export const initialState: AppState = {
  connection: "booting",
  model: "detecting",
  threadId: "",
  turnId: "",
  turn: "idle",
  transcript: [
    {
      id: "startup",
      role: "system",
      text: "MAGI interface booting. Establishing Codex app-server link…",
      streaming: false,
    },
  ],
  activity: [],
  plan: [],
  tokens: {
    total: 0,
    input: 0,
    output: 0,
    contextWindow: 0,
  },
  diff: {
    additions: 0,
    deletions: 0,
    files: [],
  },
  diffItems: {},
  mcp: [],
  conversationSynchronization: {
    percent: 18,
    updatedAt: null,
    awaitingHumanSince: null,
    lastResponseMs: null,
    exchanges: 0,
    lastInputWords: 0,
    lastInputIncrease: 0,
  },
  approval: null,
  notice: "INITIALIZING",
  diagnostic: "",
};
