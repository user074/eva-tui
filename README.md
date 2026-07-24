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

## Version 0.5

- Starts a new Codex thread in the selected workspace.
- Streams Codex responses into the thread spine.
- Adds a Tier 3 Kitty-graphics backend that rasterizes high-resolution warning
  compositions and anchors them inside the Ink layout with Unicode image
  placeholders.
- Grounds the earthquake, tsunami, and station screens in the actual
  organization of `ews-concept-new`: earthquake ticker bands and a central
  hex cluster; a tiled tsunami warning field, six placards, and an information
  dossier; and multi-spine station ribs with skewed status blades.
- Includes selected, attributed upstream visual assets under their modified
  MIT license rather than substituting unrelated wave or radar imagery.
- Adds a portable semantic TUI renderer for Apple Terminal and other standard
  terminals. It constructs hazard rails, long-hex panels, alert placards,
  dossiers, linked ribs, solid color chassis, and real text directly in
  terminal cells; it never downsamples the Kitty image into block pixels.
- Runs geometry as a staged reveal, then leaves selected warning triangles,
  rails, and signals on a terminal-driven pulse with no idle JavaScript timer.
- Uses an operations-first command-center screen instead of making chat the
  primary canvas.
- Provides Operations, Stations, Impact, and Transcript scenes.
- Renders MCP servers, shell commands, git, workspace changes, tool calls,
  agents, and audio as a rib-cage Station Matrix derived from recorded state.
- Retains affected filenames from Codex diff events and visualizes them as a
  change-propagation field.
- Shows actual plan completion, context use, diff statistics, MCP readiness,
  and command/tool/file activity.
- Renders approvals and failed turns as full-screen `警告` incident consoles.
- Includes explicitly labeled, non-mutating earthquake and tsunami visual
  simulations.
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
- For Tier 3 graphics: Kitty 0.28+ or another terminal with Kitty graphics
  Unicode-placeholder support. Kitty, Ghostty, and WezTerm are detected in
  automatic mode.

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
eva --graphics kitty
eva --graphics text
EVA_TUI_MUSIC="/path/to/track.wav" eva
EVA_TUI_YOUTUBE="https://music.youtube.com/watch?v=3BqrH0BzqSo" eva
EVA_TUI_GRAPHICS=kitty eva
```

Audio can be toggled at any time with `Ctrl-G` or by entering `/music`.
`--music` and `--youtube` are mutually exclusive.

## Controls

| Key | Action |
| --- | --- |
| `Enter` | Send the composer text to Codex |
| `Tab` / `Shift-Tab` | Cycle Operations, Stations, Impact, and Transcript |
| `Up` / `Down` | Select and inspect a Station Matrix node |
| `Escape` | Return to Operations or dismiss a simulation |
| `Ctrl-C` | Interrupt an active turn; exit while idle |
| `Ctrl-G` | Toggle audio |
| `Ctrl-Q` | Exit |
| `Y` | Accept an approval |
| `A` | Accept for the session |
| `N` | Decline |
| `Escape` | Deny and cancel the turn |

Slash commands:

- `/view operations`
- `/view stations`
- `/view impact`
- `/view transcript`
- `/simulate earthquake` or `/eq`
- `/simulate tsunami` or `/tsunami`
- `/music`, `/interrupt`, `/help`, and `/quit`

Simulation screens are fixture-driven and always marked
`試験 / SIMULATION`. They do not start a Codex turn or modify the workspace.

## Terminal graphics

`--graphics auto` is the default. Outside tmux it enables the Tier 3 renderer
when EVA TUI detects Kitty, Ghostty, or WezTerm; otherwise it selects the
portable text renderer.

Tier 3 builds each scene as a high-resolution SVG composition, rasterizes it
to a compressed PNG, transfers the PNG with the Kitty graphics protocol, creates
a virtual image placement, and prints ordinary Unicode placeholder cells
inside the Ink tree. That last step matters: Ink can continue to own layout,
resizing, and alternate-screen cleanup while the terminal draws the image at
native pixel quality.

Use `--graphics kitty` to request the backend or `--graphics text` to disable
it. A forced request exits with an actionable diagnostic when the current
terminal does not identify itself as Kitty-compatible, instead of exposing the
Unicode placeholder cells. Automatic mode stays on text inside tmux because
Kitty passthrough must be enabled explicitly; after configuring tmux
passthrough, request Kitty mode.

The portable renderer is a separate semantic composition of the same scene
hierarchy. It uses true-color ANSI styling, real selectable text, Unicode
chassis lines, East Asian double-width labels, and discrete animation. It does
not rasterize the SVG or encode pixels as quadrant, half-block, or Braille
cells. This gives Apple Terminal a sharp operational layout whose geometry and
labels remain stable across font sizes.

The reusable visual vocabulary, reference mapping, responsive rules, animation
rules, and anti-patterns are documented in
[`docs/TUI_DESIGN_GUIDE.md`](docs/TUI_DESIGN_GUIDE.md). Run `pnpm preview:tui`
to generate deterministic standard and compact scene previews.

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
[nerv-ui](https://github.com/mdrbx/nerv-ui). Version 0.5 includes selected
warning, stripe, hex, and station-blade assets from `ews-concept-new` under its
modified MIT license. Attribution and the complete upstream license are in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and
`assets/ews-concept-new/LICENSE`. No anime screenshots, logos, commercial
fonts, or music are included. EVA TUI is not affiliated with or endorsed by
the referenced projects or their rights holders.

## Why the boundary matters

The visual and interaction layer lives entirely in this repository. The
Codex CLI remains the execution engine and source of truth for configuration,
authentication, sandboxing, tools, and model behavior. Protocol handling is
isolated in `src/codex`, so a future Codex protocol change can be adapted
without rewriting the UI.

The app-server surface is still evolving. Version 0.5 deliberately supports
the core thread/turn path and approvals first. Rich `requestUserInput`, MCP
elicitation forms, history/resume, and dynamic client-hosted tools are planned
follow-ups; unsupported server requests receive a clear protocol error rather
than hanging the turn.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm preview:tui
```

Licensed under Apache-2.0.
