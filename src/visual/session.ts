import { EventEmitter } from "node:events";

import { AudioDirector } from "../audio/director.js";
import { CodexClient } from "../codex/client.js";
import type {
  ApprovalDecision,
  CodexNotification,
  ServerRequest,
} from "../codex/protocol.js";
import { initialState, type AppAction, type AppState } from "../state/model.js";
import { appReducer } from "../state/reducer.js";
import {
  buildStations,
  impactNodes,
  planProgress,
  SCENES,
  type Scene,
  type Simulation,
} from "../ui/operations-model.js";

export interface VisualSessionOptions {
  cwd: string;
  model?: string;
  codexBin?: string;
  musicPath?: string;
  youtubeUrl?: string;
  audioOn: boolean;
}

export interface VisualSnapshot {
  state: AppState;
  audio: {
    enabled: boolean;
    status: string;
  };
  scene: Scene;
  simulation: Simulation | null;
  failureVisible: boolean;
  stations: ReturnType<typeof buildStations>;
  impact: ReturnType<typeof impactNodes>;
  synchronization: ReturnType<typeof planProgress>;
  workspace: string;
}

export type VisualAction =
  | { type: "command"; text: string }
  | { type: "view"; scene: Scene }
  | { type: "simulate"; simulation: Simulation }
  | { type: "dismiss" }
  | { type: "audio"; enabled?: boolean }
  | { type: "interrupt" }
  | { type: "approval"; decision: ApprovalDecision };

const SUPPORTED_APPROVALS = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
];

export class VisualSession extends EventEmitter {
  private readonly options: VisualSessionOptions;
  private readonly client = new CodexClient();
  private readonly audio: AudioDirector;
  private state: AppState = initialState;
  private scene: Scene = "operations";
  private simulation: Simulation | null = null;
  private failureDismissed = false;
  private messageCounter = 0;
  private disposed = false;

  constructor(options: VisualSessionOptions) {
    super();
    this.options = options;
    this.audio = new AudioDirector({
      ...(options.musicPath ? { musicPath: options.musicPath } : {}),
      ...(options.youtubeUrl ? { youtubeUrl: options.youtubeUrl } : {}),
    });
    this.bindEvents();
  }

  async connect(): Promise<void> {
    try {
      const { threadId, model } = await this.client.connect({
        cwd: this.options.cwd,
        clientName: "eva_visual",
        clientTitle: "EVA Visual",
        ...(this.options.model ? { model: this.options.model } : {}),
        ...(this.options.codexBin ? { codexBin: this.options.codexBin } : {}),
      });
      if (!this.disposed) {
        this.dispatch({
          type: "connected",
          threadId,
          model,
          at: Date.now(),
        });
        if (this.options.audioOn) {
          this.audio.setEnabled(true);
        }
      }
    } catch (error: unknown) {
      if (!this.disposed) {
        this.dispatch({
          type: "connection-failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  snapshot(): VisualSnapshot {
    const audioStatus = this.audio.label;
    return {
      state: this.state,
      audio: {
        enabled: this.audio.enabled,
        status: audioStatus,
      },
      scene: this.scene,
      simulation: this.simulation,
      failureVisible: this.state.turn === "failed" && !this.failureDismissed,
      stations: buildStations(this.state, audioStatus),
      impact: impactNodes(this.state),
      synchronization: planProgress(this.state),
      workspace: this.options.cwd,
    };
  }

  async act(action: VisualAction): Promise<void> {
    switch (action.type) {
      case "command":
        await this.submit(action.text);
        return;
      case "view":
        if (!SCENES.includes(action.scene)) {
          throw new Error(`Unknown visual scene: ${String(action.scene)}`);
        }
        this.scene = action.scene;
        this.dispatch({
          type: "notice",
          message: `${action.scene.toUpperCase()} DISPLAY ACTIVE`,
        });
        return;
      case "simulate":
        if (action.simulation !== "earthquake" && action.simulation !== "tsunami") {
          throw new Error("Unknown simulation.");
        }
        this.simulation = action.simulation;
        this.emitSnapshot();
        return;
      case "dismiss":
        this.simulation = null;
        this.failureDismissed = true;
        this.emitSnapshot();
        return;
      case "audio":
        this.audio.setEnabled(action.enabled ?? !this.audio.enabled);
        this.emitSnapshot();
        return;
      case "interrupt":
        await this.client.interrupt();
        return;
      case "approval":
        this.resolveApproval(action.decision);
        return;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.audio.dispose();
    this.client.dispose();
    this.removeAllListeners();
  }

  private bindEvents(): void {
    this.client.on("notification", (notification: CodexNotification) => {
      if (notification.method === "turn/started") {
        this.failureDismissed = false;
      }
      this.dispatch({ type: "notification", notification, at: Date.now() });
    });
    this.client.on("request", (request: ServerRequest) => {
      if (SUPPORTED_APPROVALS.includes(request.method)) {
        this.dispatch({ type: "server-request", request });
        return;
      }
      this.client.respondWithError(
        request.id,
        `EVA visual console does not yet implement ${request.method}.`,
      );
      this.dispatch({
        type: "diagnostic",
        message: `Unsupported server request: ${request.method}`,
      });
    });
    this.client.on("diagnostic", (message: string) => {
      this.dispatch({ type: "diagnostic", message });
    });
    this.client.on("disconnected", (message: string) => {
      this.dispatch({ type: "disconnected", message });
    });
    this.audio.on("status", () => this.emitSnapshot());
    this.audio.on("error", (message: string) => {
      this.dispatch({ type: "diagnostic", message: `Audio: ${message}` });
    });
  }

  private dispatch(action: AppAction): void {
    this.state = appReducer(this.state, action);
    this.emitSnapshot();
  }

  private emitSnapshot(): void {
    if (!this.disposed) {
      this.emit("snapshot", this.snapshot());
    }
  }

  private async submit(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text) {
      return;
    }
    if (text === "/music") {
      this.audio.toggle();
      this.emitSnapshot();
      return;
    }
    if (text === "/simulate earthquake" || text === "/eq") {
      this.simulation = "earthquake";
      this.emitSnapshot();
      return;
    }
    if (text === "/simulate tsunami" || text === "/tsunami") {
      this.simulation = "tsunami";
      this.emitSnapshot();
      return;
    }
    if (text.startsWith("/view ")) {
      const target = text.slice(6).trim() as Scene;
      if (SCENES.includes(target)) {
        this.scene = target;
        this.dispatch({ type: "notice", message: `${target.toUpperCase()} DISPLAY ACTIVE` });
      } else {
        this.dispatch({
          type: "notice",
          message: `UNKNOWN VIEW — ${SCENES.join(", ").toUpperCase()}`,
        });
      }
      return;
    }
    if (text === "/interrupt") {
      await this.client.interrupt();
      return;
    }
    if (text === "/help") {
      this.dispatch({
        type: "notice",
        message: "SELECT VIEW · /VIEW <NAME> · /SIMULATE EARTHQUAKE|TSUNAMI",
      });
      return;
    }
    if (this.state.connection !== "online") {
      this.dispatch({ type: "notice", message: "WAITING FOR SYSTEM LINK" });
      return;
    }
    if (this.state.turn === "running") {
      this.dispatch({ type: "notice", message: "TURN ACTIVE — INTERRUPT TO ABORT" });
      return;
    }

    const sentAt = Date.now();
    this.messageCounter += 1;
    this.dispatch({
      type: "operator-message",
      id: `operator-${sentAt}-${this.messageCounter}`,
      text,
      at: sentAt,
    });
    try {
      await this.client.startTurn(text);
    } catch (error: unknown) {
      this.dispatch({
        type: "connection-failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private resolveApproval(decision: ApprovalDecision): void {
    const approval = this.state.approval;
    if (!approval) {
      throw new Error("There is no pending approval.");
    }
    this.client.respondToApproval(
      approval.id,
      decision,
      approval.method,
      approval.payload,
    );
    this.dispatch({ type: "approval-resolved", decision });
  }
}
