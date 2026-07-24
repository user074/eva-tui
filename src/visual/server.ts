import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { fileURLToPath } from "node:url";

import type { ApprovalDecision } from "../codex/protocol.js";
import type { Scene, Simulation } from "../ui/operations-model.js";
import {
  VisualSession,
  type VisualAction,
  type VisualSessionOptions,
  type VisualSnapshot,
} from "./session.js";

export interface VisualConsoleOptions extends VisualSessionOptions {
  port?: number;
  openBrowser?: boolean;
}

const VISUAL_ROOT = fileURLToPath(new URL("../../assets/visual/", import.meta.url));
const EWS_ROOT = fileURLToPath(
  new URL("../../assets/ews-concept-new/images/", import.meta.url),
);
const MAX_BODY_BYTES = 64 * 1024;

const STATIC_FILES = new Map<string, { path: string; type: string }>([
  ["/", { path: `${VISUAL_ROOT}index.html`, type: "text/html; charset=utf-8" }],
  ["/app.css", { path: `${VISUAL_ROOT}app.css`, type: "text/css; charset=utf-8" }],
  ["/app.js", { path: `${VISUAL_ROOT}app.js`, type: "text/javascript; charset=utf-8" }],
]);

const EWS_FILES = new Map<string, string>([
  ["SkewRectangle_Green.svg", "image/svg+xml"],
  ["SkewRectangle_Green_Flip.svg", "image/svg+xml"],
  ["SkewRectangle_Red.svg", "image/svg+xml"],
  ["SkewRectangle_Red_Flip.svg", "image/svg+xml"],
  ["long_shape.svg", "image/svg+xml"],
  ["strip.svg", "image/svg+xml"],
  ["warning_gempa_black.svg", "image/svg+xml"],
  ["warning_gempa_red_yellow.svg", "image/svg+xml"],
  ["warning_hex_red.png", "image/png"],
  ["warning_shape_black.svg", "image/svg+xml"],
  ["warning_tsunami_yellow.png", "image/png"],
]);

function securityHeaders(response: ServerResponse): void {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  securityHeaders(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const value: unknown = raw ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

function parseAction(value: Record<string, unknown>): VisualAction {
  switch (value.type) {
    case "command":
      if (typeof value.text !== "string") {
        throw new Error("Command text is required.");
      }
      return { type: "command", text: value.text };
    case "view":
      if (
        value.scene !== "operations" &&
        value.scene !== "stations" &&
        value.scene !== "impact" &&
        value.scene !== "transcript"
      ) {
        throw new Error("Invalid scene.");
      }
      return { type: "view", scene: value.scene as Scene };
    case "simulate":
      if (value.simulation !== "earthquake" && value.simulation !== "tsunami") {
        throw new Error("Invalid simulation.");
      }
      return { type: "simulate", simulation: value.simulation as Simulation };
    case "dismiss":
      return { type: "dismiss" };
    case "audio":
      if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
        throw new Error("Audio enabled must be a boolean.");
      }
      return value.enabled === undefined
        ? { type: "audio" }
        : { type: "audio", enabled: value.enabled };
    case "interrupt":
      return { type: "interrupt" };
    case "approval":
      if (
        value.decision !== "accept" &&
        value.decision !== "acceptForSession" &&
        value.decision !== "decline" &&
        value.decision !== "cancel"
      ) {
        throw new Error("Invalid approval decision.");
      }
      return {
        type: "approval",
        decision: value.decision as ApprovalDecision,
      };
    default:
      throw new Error("Unknown visual console action.");
  }
}

function openExternal(url: string): void {
  const command =
    process.platform === "darwin"
      ? { file: "open", args: [url] }
      : process.platform === "win32"
        ? { file: "cmd", args: ["/c", "start", "", url] }
        : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function writeSnapshot(response: ServerResponse, snapshot: VisualSnapshot): void {
  response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
}

export async function startVisualConsole(
  options: VisualConsoleOptions,
): Promise<void> {
  const token = randomBytes(24).toString("base64url");
  const session = new VisualSession(options);
  const streams = new Set<ServerResponse>();

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "127.0.0.1"}`,
      );
      const pathname = requestUrl.pathname;

      const staticFile = STATIC_FILES.get(pathname);
      if (request.method === "GET" && staticFile) {
        const content = await readFile(staticFile.path);
        securityHeaders(response);
        response.writeHead(200, { "Content-Type": staticFile.type });
        response.end(content);
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/ews/")) {
        const name = pathname.slice("/ews/".length);
        const contentType = EWS_FILES.get(name);
        if (!contentType) {
          sendJson(response, 404, { error: "Asset not found." });
          return;
        }
        const content = await readFile(`${EWS_ROOT}${name}`);
        securityHeaders(response);
        response.writeHead(200, { "Content-Type": contentType });
        response.end(content);
        return;
      }

      const requestToken =
        requestUrl.searchParams.get("token") ?? request.headers["x-eva-token"];
      if (requestToken !== token) {
        sendJson(response, 403, { error: "Invalid console token." });
        return;
      }

      if (request.method === "GET" && pathname === "/api/state") {
        sendJson(response, 200, session.snapshot());
        return;
      }

      if (request.method === "GET" && pathname === "/events") {
        securityHeaders(response);
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          Connection: "keep-alive",
        });
        response.write("retry: 1200\n\n");
        writeSnapshot(response, session.snapshot());
        streams.add(response);
        request.once("close", () => streams.delete(response));
        return;
      }

      if (request.method === "POST" && pathname === "/api/action") {
        const body = await readJson(request);
        await session.act(parseAction(body));
        sendJson(response, 200, session.snapshot());
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error: unknown) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  session.on("snapshot", (snapshot: VisualSnapshot) => {
    for (const stream of streams) {
      writeSnapshot(stream, snapshot);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4587, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("EVA visual console could not determine its local address.");
  }
  const url = `http://127.0.0.1:${address.port}/?token=${token}`;
  process.stdout.write(`EVA visual console: ${url}\n`);
  process.stdout.write("Press Ctrl-C in this terminal to stop the console.\n");

  const shutdown = (): void => {
    for (const stream of streams) {
      stream.end();
    }
    streams.clear();
    session.dispose();
    server.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  if (options.openBrowser !== false) {
    openExternal(url);
  }
  void session.connect();
}
