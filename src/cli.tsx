#!/usr/bin/env node

import { resolve } from "node:path";
import process from "node:process";
import { homedir } from "node:os";
import React from "react";
import { render } from "ink";

import { App, type AppProps } from "./app.js";
import { extractYoutubeVideoId } from "./audio/youtube.js";
import {
  supportsKittyGraphicsEnvironment,
  type GraphicsMode,
} from "./graphics/kitty.js";
import { startVisualConsole } from "./visual/server.js";

interface CliOptions extends AppProps {
  help: boolean;
  mode: "tui" | "visual";
  visualPort: number;
  openVisual: boolean;
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  args.splice(index, 2);
  return value;
}

function resolveUserPath(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return resolve(homedir(), value.slice(2));
  }
  return resolve(value);
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  let cwd = process.cwd();
  let model: string | undefined;
  let codexBin: string | undefined;
  let musicPath = process.env.EVA_TUI_MUSIC;
  let youtubeUrl = process.env.EVA_TUI_YOUTUBE;
  let graphicsMode = (process.env.EVA_TUI_GRAPHICS ?? "text") as GraphicsMode;
  let audioOn = false;
  let help = false;
  let mode: "tui" | "visual" = "tui";
  let modeWasSet = false;
  let visualPort = 4587;
  let openVisual = true;

  for (let index = 0; index < args.length; ) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
      args.splice(index, 1);
    } else if (argument === "--audio") {
      audioOn = true;
      args.splice(index, 1);
    } else if (argument === "--tui" || argument === "--visual") {
      if (modeWasSet) {
        throw new Error("--tui and --visual cannot be used together.");
      }
      mode = argument === "--visual" ? "visual" : "tui";
      modeWasSet = true;
      args.splice(index, 1);
    } else if (argument === "--no-open") {
      openVisual = false;
      args.splice(index, 1);
    } else if (argument === "--cwd") {
      cwd = takeValue(args, index, "--cwd");
    } else if (argument === "--model") {
      model = takeValue(args, index, "--model");
    } else if (argument === "--codex") {
      codexBin = takeValue(args, index, "--codex");
    } else if (argument === "--music") {
      musicPath = takeValue(args, index, "--music");
    } else if (argument === "--youtube") {
      youtubeUrl = takeValue(args, index, "--youtube");
    } else if (argument === "--graphics") {
      graphicsMode = takeValue(args, index, "--graphics") as GraphicsMode;
    } else if (argument === "--port") {
      const value = takeValue(args, index, "--port");
      visualPort = Number.parseInt(value, 10);
    } else {
      throw new Error(`Unknown argument: ${argument ?? ""}`);
    }
  }

  if (musicPath && youtubeUrl) {
    throw new Error("--music and --youtube cannot be used together.");
  }
  if (youtubeUrl) {
    extractYoutubeVideoId(youtubeUrl);
  }
  if (!["auto", "kitty", "text"].includes(graphicsMode)) {
    throw new Error("--graphics must be auto, kitty, or text.");
  }
  if (!Number.isInteger(visualPort) || visualPort < 0 || visualPort > 65_535) {
    throw new Error("--port must be an integer from 0 to 65535.");
  }

  return {
    cwd: resolveUserPath(cwd),
    audioOn,
    graphicsMode,
    help,
    mode,
    visualPort,
    openVisual,
    ...(model ? { model } : {}),
    ...(codexBin ? { codexBin } : {}),
    ...(musicPath ? { musicPath: resolveUserPath(musicPath) } : {}),
    ...(youtubeUrl ? { youtubeUrl } : {}),
  };
}

function printHelp(): void {
  process.stdout.write(`EVA — functional Codex operational interface

Usage:
  eva --tui [options]       Terminal interface (default)
  eva --visual [options]    Local graphical operations console

Options:
  --tui              Use the terminal interface
  --visual           Use the local graphical console
  --cwd <path>       Workspace to open (default: current directory)
  --model <name>     Override the configured Codex model
  --codex <path>     Codex binary to launch (default: codex)
  --music <path>     User-supplied audio file; never copied into the project
  --youtube <url>    Official YouTube companion-player URL
  --graphics <mode>  text (default), auto, or kitty (optional image protocol)
  --audio            Start audio immediately (off by default)
  --port <number>    Visual console port (default: 4587; 0 selects a free port)
  --no-open          Do not open the visual console in the default browser
  -h, --help         Show this help

TUI controls:
  Enter              Send instruction
  Tab / Shift-Tab    Cycle operational views
  Up / Down          Inspect Station Matrix nodes
  Escape             Return to Operations view / dismiss simulation
  Ctrl-C             Interrupt active turn; exit while idle
  Ctrl-G             Toggle audio
  Ctrl-Q             Exit
  /music             Toggle audio
  /view <name>       Open operations, stations, impact, or transcript
  /simulate earthquake [0-100]
                      Auto-sync over 10s, or hold an optional fixed percentage
  /simulate tsunami   Run the safe tsunami UI simulation
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.mode === "visual") {
    await startVisualConsole({
      cwd: options.cwd,
      audioOn: options.audioOn,
      port: options.visualPort,
      openBrowser: options.openVisual,
      ...(options.model ? { model: options.model } : {}),
      ...(options.codexBin ? { codexBin: options.codexBin } : {}),
      ...(options.musicPath ? { musicPath: options.musicPath } : {}),
      ...(options.youtubeUrl ? { youtubeUrl: options.youtubeUrl } : {}),
    });
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("EVA TUI requires an interactive terminal.");
  }
  if (
    options.graphicsMode === "kitty" &&
    !supportsKittyGraphicsEnvironment()
  ) {
    const program = process.env.TERM_PROGRAM || "unknown";
    const term = process.env.TERM || "unknown";
    throw new Error(
      [
        "Tier 3 graphics were requested, but this terminal does not advertise",
        "Kitty graphics support.",
        `Detected TERM_PROGRAM=${program}, TERM=${term}.`,
        "Open EVA TUI inside Kitty, Ghostty, or WezTerm, or use --graphics text.",
      ].join(" "),
    );
  }

  const instance = render(
    <App
      cwd={options.cwd}
      audioOn={options.audioOn}
      graphicsMode={options.graphicsMode ?? "auto"}
      {...(options.model ? { model: options.model } : {})}
      {...(options.codexBin ? { codexBin: options.codexBin } : {})}
      {...(options.musicPath ? { musicPath: options.musicPath } : {})}
      {...(options.youtubeUrl ? { youtubeUrl: options.youtubeUrl } : {})}
    />,
    {
      exitOnCtrlC: false,
      alternateScreen: true,
      incrementalRendering: true,
      maxFps: 30,
    },
  );
  await instance.waitUntilExit();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `eva: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
