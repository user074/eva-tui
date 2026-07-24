import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  accessSync,
  constants,
  existsSync,
  unlinkSync,
} from "node:fs";
import { delimiter, join } from "node:path";

import { createAmbientLoop } from "./procedural.js";
import {
  YoutubeCompanion,
  type YoutubePlaybackState,
} from "./youtube.js";

interface Player {
  command: string;
  args: (path: string) => string[];
}

export interface AudioDirectorOptions {
  musicPath?: string;
  youtubeUrl?: string;
}

function findExecutable(name: string): string | null {
  const pathEntries = (process.env.PATH ?? "").split(delimiter);
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd"] : [""];
  for (const directory of pathEntries) {
    for (const suffix of suffixes) {
      const candidate = join(directory, `${name}${suffix}`);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep searching.
      }
    }
  }
  return null;
}

function resolvePlayer(): Player | null {
  if (process.platform === "darwin") {
    const afplay = findExecutable("afplay");
    return afplay ? { command: afplay, args: (path) => ["-v", "0.55", path] } : null;
  }

  const mpv = findExecutable("mpv");
  if (mpv) {
    return {
      command: mpv,
      args: (path) => ["--no-video", "--really-quiet", "--volume=45", path],
    };
  }
  const ffplay = findExecutable("ffplay");
  if (ffplay) {
    return {
      command: ffplay,
      args: (path) => ["-nodisp", "-autoexit", "-loglevel", "quiet", "-volume", "45", path],
    };
  }
  const paplay = findExecutable("paplay");
  if (paplay) {
    return { command: paplay, args: (path) => [path] };
  }
  const aplay = findExecutable("aplay");
  return aplay ? { command: aplay, args: (path) => [path] } : null;
}

export class AudioDirector extends EventEmitter {
  private readonly requestedPath: string | undefined;
  private readonly youtube: YoutubeCompanion | undefined;
  private generatedPath: string | undefined;
  private child: ChildProcess | undefined;
  private restartTimer: NodeJS.Timeout | undefined;
  private disposed = false;

  enabled = false;
  label = "OFF";

  constructor(options: AudioDirectorOptions = {}) {
    super();
    this.requestedPath = options.musicPath;
    this.youtube = options.youtubeUrl
      ? new YoutubeCompanion(options.youtubeUrl)
      : undefined;
    this.youtube?.on("status", (status: string) => {
      this.label = status;
      this.emit("status", status);
    });
    this.youtube?.on("playback", (event: YoutubePlaybackState) => {
      if (event.state === "playing") {
        this.enabled = true;
      } else if (event.state === "paused" || event.state === "ended") {
        this.enabled = false;
      }
    });
    this.youtube?.on("error", (message: string) => {
      this.enabled = false;
      this.emit("error", message);
    });
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;
    if (this.youtube) {
      if (!enabled) {
        this.label = "OFF";
        this.emit("status", this.label);
      }
      void this.youtube.setEnabled(enabled).catch((error: unknown) => {
        if (this.disposed) {
          return;
        }
        this.enabled = false;
        this.label = "YOUTUBE FAULT";
        this.emit(
          "error",
          error instanceof Error ? error.message : String(error),
        );
        this.emit("status", this.label);
      });
      return;
    }
    if (enabled) {
      this.play();
    } else {
      this.stop();
      this.label = "OFF";
      this.emit("status", this.label);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.enabled = false;
    this.stop();
    this.youtube?.dispose();
    if (this.generatedPath && existsSync(this.generatedPath)) {
      try {
        unlinkSync(this.generatedPath);
      } catch {
        // Temporary audio cleanup is best effort.
      }
    }
  }

  private play(): void {
    const player = resolvePlayer();
    if (!player) {
      this.enabled = false;
      this.label = "NO AUDIO PLAYER";
      this.emit("error", "No supported audio player was found (afplay, mpv, ffplay, paplay, or aplay).");
      this.emit("status", this.label);
      return;
    }

    let audioPath: string;
    if (this.requestedPath) {
      if (!existsSync(this.requestedPath)) {
        this.enabled = false;
        this.label = "TRACK NOT FOUND";
        this.emit("error", `Music file not found: ${this.requestedPath}`);
        this.emit("status", this.label);
        return;
      }
      audioPath = this.requestedPath;
      this.label = "CUSTOM TRACK";
    } else {
      this.generatedPath ??= createAmbientLoop();
      audioPath = this.generatedPath;
      this.label = "ORIGINAL AMBIENT";
    }

    this.emit("status", this.label);
    const child = spawn(player.command, player.args(audioPath), {
      stdio: "ignore",
      windowsHide: true,
    });
    this.child = child;
    child.once("error", (error) => {
      this.enabled = false;
      this.label = "AUDIO FAULT";
      this.emit("error", error.message);
      this.emit("status", this.label);
    });
    child.once("close", () => {
      if (this.child === child) {
        this.child = undefined;
      }
      if (this.enabled && !this.disposed) {
        this.restartTimer = setTimeout(() => this.play(), 250);
        this.restartTimer.unref();
      }
    });
  }

  private stop(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    const child = this.child;
    this.child = undefined;
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }
}
