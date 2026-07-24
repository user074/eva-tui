import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { EventEmitter } from "node:events";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_STATE_BODY = 8_192;

export interface YoutubePlaybackState {
  state: "ready" | "playing" | "paused" | "buffering" | "ended" | "error";
  message: string;
}

export interface YoutubeCompanionOptions {
  openBrowser?: boolean;
  opener?: (url: string) => void;
}

export function extractYoutubeVideoId(input: string): string {
  const trimmed = input.trim();
  if (VIDEO_ID.test(trimmed)) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("YouTube source must be a video ID or an HTTPS YouTube URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("YouTube source must use HTTPS.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate = "";
  if (
    hostname === "youtube.com" ||
    hostname === "music.youtube.com" ||
    hostname === "m.youtube.com"
  ) {
    if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v") ?? "";
    } else if (url.pathname.startsWith("/embed/")) {
      candidate = url.pathname.split("/")[2] ?? "";
    } else if (url.pathname.startsWith("/shorts/")) {
      candidate = url.pathname.split("/")[2] ?? "";
    }
  } else if (hostname === "youtu.be") {
    candidate = url.pathname.slice(1).split("/")[0] ?? "";
  } else {
    throw new Error("Only youtube.com, music.youtube.com, or youtu.be URLs are supported.");
  }

  if (!VIDEO_ID.test(candidate)) {
    throw new Error("The YouTube URL does not contain a valid video ID.");
  }
  return candidate;
}

function openSystemBrowser(url: string): void {
  let command: string;
  let args: string[];
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "rundll32";
    args = ["url.dll,FileProtocolHandler", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.once("error", () => {
    // The companion page remains available at its printed localhost URL.
  });
  child.unref();
}

function send(
  response: ServerResponse,
  status: number,
  type: string,
  body: string,
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": type,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(body);
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_STATE_BODY) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Request body is not valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

export class YoutubeCompanion extends EventEmitter {
  readonly videoId: string;

  private readonly token = randomBytes(24).toString("base64url");
  private readonly nonce = randomBytes(18).toString("base64");
  private readonly shouldOpenBrowser: boolean;
  private readonly opener: (url: string) => void;
  private readonly clients = new Set<ServerResponse>();
  private server: Server | undefined;
  private startPromise: Promise<string> | undefined;
  private playerUrlValue = "";
  private desiredPlaying = false;
  private disposed = false;

  constructor(source: string, options: YoutubeCompanionOptions = {}) {
    super();
    this.videoId = extractYoutubeVideoId(source);
    this.shouldOpenBrowser = options.openBrowser ?? true;
    this.opener = options.opener ?? openSystemBrowser;
  }

  get playerUrl(): string {
    return this.playerUrlValue;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.desiredPlaying = enabled;
    if (enabled) {
      const url = await this.start();
      this.broadcast("play");
      this.emit(
        "status",
        this.clients.size > 0 ? "YOUTUBE PLAY REQUESTED" : "YOUTUBE — CLICK PLAY",
      );
      this.emit("url", url);
    } else {
      this.broadcast("pause");
      this.emit("status", "OFF");
    }
  }

  async start(): Promise<string> {
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = new Promise<string>((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.handleRequest(request, response);
      });
      this.server = server;
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        if (this.disposed) {
          server.close();
          reject(new Error("YouTube companion closed before startup."));
          return;
        }
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Could not determine YouTube companion address."));
          return;
        }
        this.playerUrlValue = `http://127.0.0.1:${address.port}/?token=${encodeURIComponent(this.token)}`;
        if (this.shouldOpenBrowser) {
          try {
            this.opener(this.playerUrlValue);
          } catch (error) {
            server.close();
            reject(error);
            return;
          }
        }
        resolve(this.playerUrlValue);
      });
    });
    return this.startPromise;
  }

  dispose(): void {
    this.disposed = true;
    this.desiredPlaying = false;
    this.broadcast("stop");
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
    const server = this.server;
    if (server?.listening) {
      server.close();
    }
    this.server = undefined;
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (!request.url) {
      send(response, 400, "text/plain; charset=utf-8", "Bad request");
      return;
    }
    const origin = this.playerUrlValue
      ? new URL(this.playerUrlValue).origin
      : "http://127.0.0.1";
    const url = new URL(request.url, origin);
    if (url.searchParams.get("token") !== this.token) {
      send(response, 403, "text/plain; charset=utf-8", "Forbidden");
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      const html = this.renderPage(origin);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Security-Policy": [
          "default-src 'self'",
          `script-src 'nonce-${this.nonce}' https://www.youtube.com https://s.ytimg.com`,
          "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
          "connect-src 'self'",
          "img-src 'self' data: https://i.ytimg.com https://*.ggpht.com",
          "style-src 'unsafe-inline'",
        ].join("; "),
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      });
      response.end(html);
      return;
    }

    if (request.method === "GET" && url.pathname === "/events") {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      });
      response.flushHeaders();
      this.clients.add(response);
      this.writeCommand(response, this.desiredPlaying ? "play" : "pause");
      request.once("close", () => this.clients.delete(response));
      return;
    }

    if (request.method === "POST" && url.pathname === "/state") {
      try {
        const value = await readJsonBody(request);
        this.handlePlayerState(value);
        send(response, 204, "text/plain; charset=utf-8", "");
      } catch (error) {
        send(
          response,
          400,
          "text/plain; charset=utf-8",
          error instanceof Error ? error.message : "Invalid state",
        );
      }
      return;
    }

    send(response, 404, "text/plain; charset=utf-8", "Not found");
  }

  private handlePlayerState(value: unknown): void {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return;
    }
    const state = Reflect.get(value, "state");
    const message = Reflect.get(value, "message");
    if (
      !["ready", "playing", "paused", "buffering", "ended", "error"].includes(
        String(state),
      )
    ) {
      return;
    }
    const event: YoutubePlaybackState = {
      state: state as YoutubePlaybackState["state"],
      message: typeof message === "string" ? message : "",
    };
    if (event.state === "playing") {
      this.desiredPlaying = true;
      this.emit("status", "YOUTUBE PLAYING");
    } else if (event.state === "paused") {
      this.desiredPlaying = false;
      this.emit("status", "OFF");
    } else if (event.state === "ready") {
      this.emit(
        "status",
        this.desiredPlaying ? "YOUTUBE — CLICK PLAY" : "YOUTUBE READY",
      );
    } else if (event.state === "error") {
      this.emit("error", event.message || "YouTube player reported an error.");
      this.emit("status", "YOUTUBE FAULT");
    }
    this.emit("playback", event);
  }

  private broadcast(command: "play" | "pause" | "stop"): void {
    for (const client of this.clients) {
      this.writeCommand(client, command);
    }
  }

  private writeCommand(
    response: ServerResponse,
    command: "play" | "pause" | "stop",
  ): void {
    response.write(`event: command\ndata: ${JSON.stringify({ command })}\n\n`);
  }

  private renderPage(origin: string): string {
    const videoId = JSON.stringify(this.videoId);
    const token = JSON.stringify(this.token);
    const playerOrigin = JSON.stringify(origin);
    const musicUrl = JSON.stringify(
      `https://music.youtube.com/watch?v=${this.videoId}`,
    );
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EVA TUI // YouTube Companion</title>
  <style>
    :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      color: #f6ead7; background: #090807;
      background-image: linear-gradient(rgba(255,157,0,.045) 1px, transparent 1px);
      background-size: 100% 6px;
    }
    main { width: min(760px, calc(100vw - 32px)); border: 2px solid #ff9d00; padding: 16px; }
    header { display: flex; justify-content: space-between; gap: 16px; color: #ff9d00; font-weight: 800; }
    .warning { margin: 12px 0; padding: 6px 10px; background: #b51224; font-weight: 800; }
    #player-shell { width: 100%; aspect-ratio: 16/9; min-width: 200px; min-height: 200px; background: #000; }
    #player, #player iframe { width: 100%; height: 100%; }
    #playback-actions { display: flex; justify-content: center; margin-top: 12px; }
    #activate, #fallback {
      border: 2px solid #ff9d00; padding: 14px 22px; color: #090807; background: #ff9d00;
      font: inherit; font-weight: 900; cursor: pointer; text-decoration: none; white-space: nowrap;
    }
    #activate[hidden], #fallback[hidden] { display: none; }
    footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 12px; }
    #status { color: #3ce6e6; }
    .legal { color: #806f5f; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <header><span>EVA://CODEX AUDIO LINK</span><span>YOUTUBE COMPANION</span></header>
    <div class="warning">音声接続 / VISIBLE OFFICIAL PLAYER</div>
    <div id="player-shell">
      <div id="player"></div>
    </div>
    <div id="playback-actions">
      <button id="activate" type="button">ENABLE AUDIO / 音声開始</button>
      <a id="fallback" target="_blank" rel="noopener noreferrer" hidden>OPEN IN YOUTUBE MUSIC / 外部再生</a>
    </div>
    <footer><span id="status">INITIALIZING</span><span>Ctrl-G controls play / pause</span></footer>
    <p class="legal">Playback is provided by YouTube. This page does not download, extract, or cache media.</p>
  </main>
  <script nonce="${this.nonce}">
    const videoId = ${videoId};
    const token = ${token};
    const origin = ${playerOrigin};
    const musicUrl = ${musicUrl};
    const status = document.getElementById("status");
    const activate = document.getElementById("activate");
    const fallback = document.getElementById("fallback");
    fallback.href = musicUrl;
    let player;
    let ready = false;

    function report(state, message = "") {
      status.textContent = state.toUpperCase() + (message ? " / " + message : "");
      fetch("/state?token=" + encodeURIComponent(token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, message }),
        keepalive: true
      }).catch(() => {});
    }

    function play() {
      if (!ready) return;
      player.playVideo();
    }
    function pause() {
      if (!ready) return;
      player.pauseVideo();
    }
    function stop() {
      if (!ready) return;
      player.pauseVideo();
      status.textContent = "TUI DISCONNECTED";
    }

    window.onYouTubeIframeAPIReady = () => {
      player = new YT.Player("player", {
        width: 640,
        height: 360,
        videoId,
        host: "https://www.youtube.com",
        playerVars: { autoplay: 0, controls: 1, playsinline: 1, origin },
        events: {
          onReady: () => { ready = true; report("ready"); },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              activate.hidden = true;
              report("playing");
            } else if (event.data === YT.PlayerState.PAUSED) {
              report("paused");
            } else if (event.data === YT.PlayerState.BUFFERING) {
              report("buffering");
            } else if (event.data === YT.PlayerState.ENDED) {
              report("ended");
              player.seekTo(0, true);
              player.playVideo();
            }
          },
          onError: (event) => {
            const messages = {
              2: "invalid video ID",
              5: "HTML5 playback failed",
              100: "video unavailable or private",
              101: "embedding disabled by owner",
              150: "embedding disabled by owner"
            };
            activate.hidden = true;
            fallback.hidden = false;
            report("error", messages[event.data] || ("YouTube code " + event.data));
          }
        }
      });
    };

    activate.addEventListener("click", () => {
      if (!ready) {
        status.textContent = "PLAYER LOADING / TRY AGAIN";
        return;
      }
      activate.hidden = true;
      play();
    });

    const events = new EventSource("/events?token=" + encodeURIComponent(token));
    events.addEventListener("command", (event) => {
      const { command } = JSON.parse(event.data);
      if (command === "play") play();
      if (command === "pause") pause();
      if (command === "stop") {
        stop();
        events.close();
      }
    });
    events.onerror = () => { status.textContent = "CONTROL LINK LOST"; };

    const api = document.createElement("script");
    api.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(api);
  </script>
</body>
</html>`;
  }
}
