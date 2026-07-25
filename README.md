# EVA

EVA is an experimental pair of functional Codex clients with an anime
command-center visual language: high-contrast warning states, kanji labels,
synchronization rails, dense operational telemetry, and optional ambient
audio.

It is a separate client, not a patch to Codex. Both modes launch the installed
`codex app-server` as a child process and speak its JSONL protocol over stdio.
Updating Codex therefore does not overwrite EVA, and installing EVA does not
modify Codex.

```text
                          ┌── EVA TUI (Ink/React)
operator ──> EVA core ───┤
                          └── EVA Visual (loopback browser renderer)
                                  │
                                  └──JSONL──> codex app-server ──> Codex
```

- `eva --tui` is the portable terminal interface and remains the default.
- `eva --visual` starts a graphical console on `127.0.0.1` and opens it in the
  default browser.
- Both expose the same live transcript, plan, activity, diff, token, MCP,
  approval, interrupt, simulation, and audio state.

The visual console is not a hosted web service. Its browser page is a local
renderer connected to the EVA Node process through a token-protected
loopback API.

## Version 0.5

- Starts a new Codex thread in the selected workspace.
- Streams Codex responses into the thread spine.
- Separates `eva --tui` and `eva --visual` at the rendering boundary while
  retaining the same Codex app-server client and state model.
- Adds a functional graphical operations console with live Operations,
  Stations, Impact, and Transcript displays; Codex command submission;
  interrupts; approval controls; simulations; and audio controls.
- Uses the upstream skewed station blades, long warning shape, warning field,
  placards, and alert components directly in the visual renderer. The station
  view follows the upstream alternating rib-and-spine topology, while the
  warning displays preserve the assembled earthquake and tsunami hierarchy.
- Adds a Tier 3 Kitty-graphics backend that rasterizes high-resolution warning
  compositions and anchors them inside the Ink layout with Unicode image
  placeholders.
- Grounds the earthquake, tsunami, and station screens in the actual
  organization of `ews-concept-new`: earthquake ticker bands and a central
  alert cluster; a tiled tsunami warning field, six placards, and an information
  dossier; and multi-spine station ribs with state-bearing status blocks.
- Includes selected, attributed upstream visual assets under their modified
  MIT license rather than substituting unrelated wave or radar imagery.
- Adds a portable semantic TUI renderer for Apple Terminal and other standard
  terminals. Its active earthquake and station scenes use gapless
  background-filled alert plates and rectangular status blocks alongside
  hazard rails, placards, dossiers, linked ribs, and real text; it never
  downsamples the Kitty image into block pixels.
- Runs geometry as a staged reveal, then keeps only operational rails and
  signals moving on a low-frequency scene-local clock. Incremental line
  rendering prevents those updates from repainting unchanged output.
- Uses an operations-first command-center screen instead of making chat the
  primary canvas.
- Provides Operations, Stations, Impact, and Transcript scenes.
- Renders MCP servers, shell commands, git, workspace changes, tool calls,
  agents, and audio as a rib-cage Station Matrix derived from recorded state.
- Retains affected filenames from Codex diff events and visualizes them as a
  change-propagation field.
- Reserves a large Operations scope for live human↔Codex synchronization.
  Fast consecutive human replies raise the ratio; once Codex has yielded,
  unanswered time decays it. The scope continuously converges or separates
  three parameter-distinct sine channels to express that link.
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
- For `--tui`: a terminal with color and Unicode support.
- For `--visual`: a modern local browser.
- For local-file or generated audio: `afplay` on macOS, or `mpv`, `ffplay`,
  `paplay`, or `aplay`.
- For YouTube audio: a browser with JavaScript enabled.
- For Tier 3 graphics: Kitty 0.28+ or another terminal with Kitty graphics
  Unicode-placeholder support. Kitty, Ghostty, and WezTerm are detected in
  automatic mode.

## Install and run

```sh
npm install
npm run build
node dist/cli.js --tui
node dist/cli.js --visual
```

During development:

```sh
npm run dev -- --tui
npm run dev -- --visual
```

To make `eva` available as a command:

```sh
npm link
eva --tui --cwd /path/to/project
eva --visual --cwd /path/to/project
```

Useful options:

```sh
eva --tui
eva --visual
eva --visual --port 0
eva --visual --no-open
eva --model gpt-5.6-codex
eva --music "/path/to/your/licensed-track.mp3"
eva --music "/path/to/your/licensed-track.mp3" --audio
eva --youtube "https://music.youtube.com/watch?v=3BqrH0BzqSo"
eva --youtube "https://music.youtube.com/watch?v=3BqrH0BzqSo" --audio
eva --graphics text
eva --graphics auto
eva --graphics kitty
EVA_TUI_MUSIC="/path/to/track.wav" eva
EVA_TUI_YOUTUBE="https://music.youtube.com/watch?v=3BqrH0BzqSo" eva
EVA_TUI_GRAPHICS=kitty eva
```

Audio can be toggled at any time with `Ctrl-G` or by entering `/music`.
`--music` and `--youtube` are mutually exclusive.

Quoted home-relative music paths are expanded by EVA, so both
`--music ~/Downloads/track.mp3` and `--music "~/Downloads/track.mp3"` work.

## Visual console

`eva --visual` binds only to `127.0.0.1`, creates an unpredictable session
token, prints the protected URL, and opens it in the default browser. Use
`--no-open` to print the URL without opening it or `--port 0` to select a free
port.

The first graphical version includes:

- a live Operations display with turn state, plan synchronization, transcript,
  activity, token use, and workspace impact;
- a responsive Station Matrix made from the attributed upstream station blade
  SVGs and state-derived system nodes;
- a workspace Impact field and full Transcript display;
- full-screen, explicitly marked earthquake and tsunami UI simulations;
- full-screen Codex approval gates with authorize-once, authorize-session, and
  decline actions;
- command submission, turn interruption, scene selection, and audio toggling.

The graphical layer contains no Codex credentials and does not talk to OpenAI
directly. Closing its terminal process tears down the Codex child process,
audio director, event stream, and local server. The renderer boundary and
security model are documented in
[`docs/VISUAL_CONSOLE.md`](docs/VISUAL_CONSOLE.md).

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
- `/simulate earthquake [0-100]` or `/eq [0-100]`
- `/simulate tsunami` or `/tsunami`
- `/music`, `/interrupt`, `/help`, and `/quit`

Simulation screens are fixture-driven and always marked
`試験 / SIMULATION`. They do not start a Codex turn or modify the workspace.
For earthquake simulation, the optional percentage controls the synchronization
scope: `0` shows three distinct continuous sine curves, while `100` converges
their different starting amplitudes, frequencies, phases, and centerlines into
one locked waveform. Plain `/eq` automatically sweeps from `0` to
`100` over ten seconds and then remains locked. A real failure display follows
the live human↔Codex synchronization ratio.

The live Operations ratio uses local conversation timing only:

- Establishing the Codex link starts at 18% and begins the initial
  human-response clock.
- Codex `turn/completed` starts the human-response clock.
- The next submitted instruction records the response latency.
- Every submitted instruction adds 0.5 points per word, capped at +10 points
  for 20 words. Longer instructions cannot exceed that per-input cap.
- Waiting has a 30-second grace period, then decays continuously at one point
  per ten seconds until the human responds.
- Entering the first character pauses decay while the human is composing; the
  length-based increase is applied only when the instruction is submitted.
- Time spent while Codex is running never reduces synchronization.
- Target changes are eased into the displayed ratio and waveform rather than
  appearing as instantaneous jumps; even a maximum input takes several seconds
  to become fully visible.

## Terminal graphics

`--graphics text` is the default. It always selects the portable terminal
renderer, including inside Apple Terminal, Kitty, Ghostty, and WezTerm. No
graphics-capable terminal is required.

`--graphics auto` is an explicit convenience mode. Outside tmux it enables the
older Tier 3 image renderer when EVA detects Kitty, Ghostty, or WezTerm;
otherwise it selects the portable text renderer.

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
chassis lines, East Asian double-width labels, and discrete animation.
Large functional containers are painted as rectangular cell backgrounds so
terminal font padding cannot create seams. Reference SVG masks remain
available for compact motifs and the tsunami composition, but the earthquake
and station screens preserve their hierarchy and color mass without forcing
polygon silhouettes into a low-resolution grid. The screen is never converted
into a block-pixel screenshot.

The reusable visual vocabulary, reference mapping, responsive rules, animation
rules, and anti-patterns are documented in
[`docs/TUI_DESIGN_GUIDE.md`](docs/TUI_DESIGN_GUIDE.md). Run
`npm run preview:tui` to generate deterministic standard and compact scene
previews.

## Ratatui prototype

An isolated Rust/Ratatui renderer now provides a higher-fidelity native TUI
experiment without replacing `eva --tui`. Its active screens use large,
gapless background-filled alert plates and rectangular station blocks, while
retaining the checked-in reference assets' color hierarchy and mechanical
panel rhythm. Diagonal glyphs remain limited to small warning motifs, while
Braille is reserved for animated synchronization signals. The first functional
screens are Earthquake and Stations.

After installing Rust, run:

```sh
npm run dev:ratatui -- --scene earthquake
npm run dev:ratatui -- --scene stations
```

This prototype is currently fixture-driven and does not yet connect to Codex.
Its architecture, asset mapping, controls, deterministic dump mode, SVG
comparison export, and planned renderer protocol are documented in
[`docs/RATATUI_PROTOTYPE.md`](docs/RATATUI_PROTOTYPE.md).

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
npm run typecheck
npm test
npm run build
npm run preview:tui
```

Licensed under Apache-2.0.
