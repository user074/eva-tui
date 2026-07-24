# EVA TUI

EVA TUI is an experimental, functional terminal client for Codex with an
anime command-center visual language: high-contrast warning states, kanji
labels, synchronization rails, dense operational telemetry, and optional
ambient audio.

It is a separate client, not a patch to Codex. EVA TUI launches the installed
`codex app-server` as a child process and speaks its JSONL protocol over
stdio. Updating Codex therefore does not overwrite EVA TUI, and installing
EVA TUI does not modify Codex.

```text
keyboard ──> EVA TUI (Ink/React) ──JSONL──> codex app-server ──> Codex
                 │
                 ├── transcript / plan / diff / token / MCP telemetry
                 ├── command and file-change approval controls
                 └── optional local audio player
```

## Version 0.2

- Starts a new Codex thread in the selected workspace.
- Streams Codex responses into the thread spine.
- Shows actual plan completion, context use, diff statistics, MCP readiness,
  and command/tool/file activity.
- Renders command, file-change, and permission requests as a red `警告`
  approval console.
- Accepts, session-accepts, declines, or cancels approval requests.
- Interrupts the active Codex turn.
- Adapts between wide two-column and narrow stacked layouts.
- Plays a user-supplied music file, an original generated ambient loop, or a
  YouTube track through an official visible companion player. Audio is
  disabled by default.

## Requirements

- Node.js 22 or newer.
- A current `codex` CLI installed, authenticated, and available on `PATH`.
- A terminal with color and Unicode support.
- For local-file or generated audio: `afplay` on macOS, or `mpv`, `ffplay`,
  `paplay`, or `aplay`.
- For YouTube audio: a browser with JavaScript enabled.

## Install and run

```sh
pnpm install
pnpm build
node dist/cli.js
```

During development:

```sh
pnpm dev
```

To make `eva` available as a command:

```sh
pnpm link --global
eva --cwd /path/to/project
```

Useful options:

```sh
eva --model gpt-5.6-codex
eva --music "/path/to/your/licensed-track.mp3"
eva --music "/path/to/your/licensed-track.mp3" --audio
eva --youtube "https://music.youtube.com/watch?v=3BqrH0BzqSo"
eva --youtube "https://music.youtube.com/watch?v=3BqrH0BzqSo" --audio
EVA_TUI_MUSIC="/path/to/track.wav" eva
EVA_TUI_YOUTUBE="https://music.youtube.com/watch?v=3BqrH0BzqSo" eva
```

Audio can be toggled at any time with `Ctrl-G` or by entering `/music`.
`--music` and `--youtube` are mutually exclusive.

## Controls

| Key | Action |
| --- | --- |
| `Enter` | Send the composer text to Codex |
| `Ctrl-C` | Interrupt an active turn; exit while idle |
| `Ctrl-G` | Toggle audio |
| `Ctrl-Q` | Exit |
| `Y` | Accept an approval |
| `A` | Accept for the session |
| `N` | Decline |
| `Escape` | Deny and cancel the turn |

Slash commands: `/music`, `/interrupt`, and `/quit`.

## Music and visual references

`E01_EWS_Amano&Kosei` is a commercially released recording. It is not
downloaded, copied, or redistributed by this project. If you have a lawful
local copy, pass its path with `--music`. With no path, EVA TUI synthesizes
an original low drone into a temporary WAV file and deletes it at shutdown.

When `--youtube` is selected, the first audio toggle opens a token-protected
page on `127.0.0.1`. Click `ENABLE AUDIO / 音声開始` once to satisfy browser
playback rules. After that, `Ctrl-G` sends play and pause commands to YouTube's
official visible IFrame player. The companion loops the video when it ends and
never exposes, downloads, extracts, or caches its media stream. Closing EVA TUI
pauses the player and closes the local control server; the browser tab can then
be closed normally.

The companion accepts only HTTPS URLs from `youtube.com`,
`music.youtube.com`, or `youtu.be`. A random session token protects every
local control request, and the server binds only to the loopback interface.

Some YouTube uploads disable embedding. If YouTube reports that restriction,
the companion displays `OPEN IN YOUTUBE MUSIC / 外部再生` and the TUI reports a
playback fault. The external YouTube Music tab must then be controlled in the
browser because YouTube does not expose its playback controls to the terminal.
The supplied `E01_EWS_Amano&Kosei` upload currently has this restriction.

The interface takes broad inspiration from late-1990s anime command-center
graphics and community concepts such as
[ews-concept-new](https://github.com/bagusindrayana/ews-concept-new) and
[nerv-ui](https://github.com/mdrbx/nerv-ui). No logos, screenshots, music,
fonts, or other assets from those works are included. EVA TUI is not
affiliated with or endorsed by their rights holders.

## Why the boundary matters

The visual and interaction layer lives entirely in this repository. The
Codex CLI remains the execution engine and source of truth for configuration,
authentication, sandboxing, tools, and model behavior. Protocol handling is
isolated in `src/codex`, so a future Codex protocol change can be adapted
without rewriting the UI.

The app-server surface is still evolving. Version 0.1 deliberately supports
the core thread/turn path and approvals first. Rich `requestUserInput`, MCP
elicitation forms, history/resume, and dynamic client-hosted tools are planned
follow-ups; unsupported server requests receive a clear protocol error rather
than hanging the turn.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
```

Licensed under Apache-2.0.
