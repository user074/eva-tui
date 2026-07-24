#!/usr/bin/env node

import { resolve } from "node:path";
import process from "node:process";
import React from "react";
import { render } from "ink";

import { App, type AppProps } from "./app.js";
import { extractYoutubeVideoId } from "./audio/youtube.js";
import {
  supportsKittyGraphicsEnvironment,
  type GraphicsMode,
} from "./graphics/kitty.js";

interface CliOptions extends AppProps {
  help: boolean;
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  args.splice(index, 2);
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  let cwd = process.cwd();
  let model: string | undefined;
  let codexBin: string | undefined;
  let musicPath = process.env.EVA_TUI_MUSIC;
  let youtubeUrl = process.env.EVA_TUI_YOUTUBE;
  let graphicsMode = (process.env.EVA_TUI_GRAPHICS ?? "auto") as GraphicsMode;
  let audioOn = false;
  let help = false;

  for (let index = 0; index < args.length; ) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
      args.splice(index, 1);
    } else if (argument === "--audio") {
      audioOn = true;
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

  return {
    cwd: resolve(cwd),
    audioOn,
    graphicsMode,
    help,
    ...(model ? { model } : {}),
    ...(codexBin ? { codexBin } : {}),
    ...(musicPath ? { musicPath: resolve(musicPath) } : {}),
    ...(youtubeUrl ? { youtubeUrl } : {}),
  };
}

function printHelp(): void {
  process.stdout.write(`EVA TUI — functional Codex operational interface

Usage:
  eva [options]

Options:
  --cwd <path>       Workspace to open (default: current directory)
  --model <name>     Override the configured Codex model
  --codex <path>     Codex binary to launch (default: codex)
  --music <path>     User-supplied audio file; never copied into the project
  --youtube <url>    Official YouTube companion-player URL
  --graphics <mode>  auto, kitty (Tier 3), or text (default: auto)
  --audio            Start audio immediately (off by default)
  -h, --help         Show this help

Controls:
  Enter              Send instruction
  Tab / Shift-Tab    Cycle operational views
  Up / Down          Inspect Station Matrix nodes
  Escape             Return to Operations view / dismiss simulation
  Ctrl-C             Interrupt active turn; exit while idle
  Ctrl-G             Toggle audio
  Ctrl-Q             Exit
  /music             Toggle audio
  /view <name>       Open operations, stations, impact, or transcript
  /simulate <type>   Run a safe earthquake or tsunami UI simulation
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
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

  const instance = render(<App {...options} />, {
    exitOnCtrlC: false,
    alternateScreen: true,
  });
  await instance.waitUntilExit();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `eva: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
