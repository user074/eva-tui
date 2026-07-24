import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";

import {
  asObject,
  asString,
  type ApprovalDecision,
  type CodexNotification,
  type JsonObject,
  type JsonValue,
  type RequestId,
  type ServerRequest,
  type WireMessage,
} from "./protocol.js";

interface PendingCall {
  method: string;
  resolve: (value: JsonValue) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface ConnectOptions {
  cwd: string;
  model?: string;
  codexBin?: string;
}

export interface ConnectedThread {
  threadId: string;
  model: string;
}

export class CodexClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private readonly pending = new Map<string, PendingCall>();
  private disposed = false;

  threadId: string | undefined;
  turnId: string | undefined;

  async connect(options: ConnectOptions): Promise<ConnectedThread> {
    if (this.child) {
      throw new Error("Codex app-server is already connected.");
    }

    const binary = options.codexBin ?? "codex";
    const child = spawn(binary, ["app-server", "--listen", "stdio://"], {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    child.on("error", (error) => {
      this.emit("diagnostic", `app-server failed: ${error.message}`);
      this.rejectPending(error);
    });
    child.on("close", (code, signal) => {
      const suffix = signal ? `signal ${signal}` : `code ${String(code)}`;
      this.emit("disconnected", suffix);
      if (!this.disposed) {
        this.rejectPending(new Error(`Codex app-server exited with ${suffix}.`));
      }
    });

    const stdoutLines = createInterface({ input: child.stdout });
    stdoutLines.on("line", (line) => this.handleLine(line));

    const stderrLines = createInterface({ input: child.stderr });
    stderrLines.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      try {
        const log = asObject(JSON.parse(trimmed));
        const message = asString(asObject(log.fields).message);
        this.emit("log", message || trimmed);
      } catch {
        if (/\b(error|failed|fatal)\b/i.test(trimmed)) {
          this.emit("diagnostic", trimmed);
        }
      }
    });

    await this.request("initialize", {
      clientInfo: {
        name: "eva_tui",
        title: "EVA TUI",
        version: "0.2.0",
      },
      capabilities: {},
    });
    this.notify("initialized", {});

    const threadParams: JsonObject = { cwd: options.cwd };
    if (options.model) {
      threadParams.model = options.model;
    }

    const result = asObject(await this.request("thread/start", threadParams));
    const thread = asObject(result.thread);
    const threadId = asString(thread.id);
    if (!threadId) {
      throw new Error("Codex returned an invalid thread/start response.");
    }

    this.threadId = threadId;
    const model = asString(result.model, options.model ?? "configured model");
    return { threadId, model };
  }

  async startTurn(text: string): Promise<string> {
    if (!this.threadId) {
      throw new Error("No Codex thread is connected.");
    }
    const result = asObject(
      await this.request("turn/start", {
        threadId: this.threadId,
        input: [{ type: "text", text }],
      }),
    );
    const turn = asObject(result.turn);
    const turnId = asString(turn.id);
    if (!turnId) {
      throw new Error("Codex returned an invalid turn/start response.");
    }
    this.turnId = turnId;
    return turnId;
  }

  async interrupt(): Promise<void> {
    if (!this.threadId || !this.turnId) {
      return;
    }
    await this.request("turn/interrupt", {
      threadId: this.threadId,
      turnId: this.turnId,
    });
  }

  respondToApproval(
    id: RequestId,
    decision: ApprovalDecision,
    method: string,
    params: JsonObject,
  ): void {
    if (method === "item/permissions/requestApproval") {
      const accepted = decision === "accept" || decision === "acceptForSession";
      this.send({
        id,
        result: {
          permissions: accepted ? asObject(params.permissions) : {},
          scope: decision === "acceptForSession" ? "session" : "turn",
        },
      });
      if (decision === "cancel") {
        void this.interrupt();
      }
      return;
    }
    this.send({ id, result: { decision } });
  }

  respondWithError(id: RequestId, message: string): void {
    this.send({
      id,
      error: {
        code: -32601,
        message,
      },
    });
  }

  dispose(): void {
    this.disposed = true;
    this.rejectPending(new Error("EVA TUI closed."));
    const child = this.child;
    this.child = undefined;
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  private request(method: string, params: JsonObject): Promise<JsonValue> {
    const id = this.nextId++;
    const key = String(id);
    return new Promise<JsonValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`${method} timed out after 30 seconds.`));
      }, 30_000);
      timer.unref();
      this.pending.set(key, { method, resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  private notify(method: string, params: JsonObject): void {
    this.send({ method, params });
  }

  private send(message: WireMessage): void {
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed) {
      throw new Error("Codex app-server stdin is not available.");
    }
    stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: WireMessage;
    try {
      message = JSON.parse(line) as WireMessage;
    } catch {
      this.emit("diagnostic", `Ignored non-JSON app-server output: ${line}`);
      return;
    }

    if (message.method && message.id !== undefined) {
      const request: ServerRequest = {
        id: message.id,
        method: message.method,
        params: asObject(message.params),
      };
      this.emit("request", request);
      return;
    }

    if (message.method) {
      const notification: CodexNotification = {
        method: message.method,
        params: asObject(message.params),
      };
      this.handleNotificationBookkeeping(notification);
      this.emit("notification", notification);
      return;
    }

    if (message.id !== undefined) {
      const key = String(message.id);
      const call = this.pending.get(key);
      if (!call) {
        return;
      }
      this.pending.delete(key);
      clearTimeout(call.timer);
      if (message.error !== undefined) {
        call.reject(
          new Error(`${call.method} failed: ${JSON.stringify(message.error)}`),
        );
      } else {
        call.resolve(message.result ?? null);
      }
    }
  }

  private handleNotificationBookkeeping(notification: CodexNotification): void {
    const { method, params } = notification;
    if (method === "turn/started") {
      this.turnId = asString(asObject(params.turn).id, this.turnId);
    } else if (method === "turn/completed") {
      this.turnId = undefined;
    }
  }

  private rejectPending(error: Error): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
  }
}
