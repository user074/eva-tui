# EVA Ratatui prototype

The Ratatui renderer is an isolated native prototype. It does not replace the
working Ink client and does not patch Codex. Its purpose is to compare a direct
terminal-cell renderer against the React/Ink path before the project commits to
a native frontend.

## What is implemented

- An animated earthquake test screen with the original warning assembly:
  ticker rails, a layered long warning chassis, side warning hexagons, three
  linked data hexagons, alert placards, an incident dossier, and a Braille
  synchronization scope.
- An animated station matrix with multiple vertical ribs, alternating connected
  station blades, selection, live/paused state, event counts, and responsive
  three-, four-, or five-rib layouts.
- A hybrid rendering model. Warning rails, hexagonal chassis, placards,
  dossiers, and station blades use hard cell-native fills, stepped spans, and
  inverted diagonal cutout masks. Braille is reserved for signals and traces.
- An experimental 2×2 sub-cell polygon rasterizer remains available for future
  plots, but is deliberately not used for the large EVA chassis geometry:
  sampling those elements makes their silhouettes look soft in real fonts.
- A fixed-rate event loop capped at 30 FPS, Ratatui double-buffered updates, a
  minimum-size notice, deterministic test rendering, and SVG export for visual
  comparison.

The prototype is fixture-driven. It does not yet send commands to Codex.

## Source-asset mapping

The geometry is derived from the attributed files already checked into
`assets/ews-concept-new/images`:

| Terminal element | Source geometry retained |
| --- | --- |
| Long warning chassis | `long_shape.svg`: `146.257 / 1564` cap ratio and red/black/red layers |
| Data and warning hexes | `hex_shape.svg`: `145.77 / 584` cap ratio and red/black/red layers |
| Station blades | `SkewRectangle_*.svg`: `37.5414 / 500` skew |
| Blade accent | `SkewRectangle_*.svg`: `168.5 / 500` width and `19 / 100` height |
| Warning rails | `strip.svg`: `26 / 59.213` bar-to-period ratio and matching shear |

These ratios are translated into stepped terminal spans and hard cutout masks
rather than approximated with generic ASCII outlines or sampled as tiny image
pixels. Braille is used only where its dotted texture is useful: signals and
traces.

## Install Rust

The prototype requires a Rust toolchain. Install it from the official Rust
installer if `cargo --version` is not available:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Open a new shell after installation.

## Run

From the repository root:

```sh
npm run dev:ratatui -- --scene earthquake
npm run dev:ratatui -- --scene stations
```

The equivalent Cargo commands are:

```sh
cargo run --manifest-path crates/eva-ratatui/Cargo.toml -- --scene earthquake
cargo run --manifest-path crates/eva-ratatui/Cargo.toml -- --scene stations
```

Controls:

| Key | Action |
| --- | --- |
| `Tab`, `e`, `s` | Switch scenes |
| Arrow keys | Select a station |
| `Space` | Pause or resume animation |
| `q`, `Ctrl-C` | Exit |

The renderer needs at least 72×22 cells. A 100×29 window is the reference
viewport.

## Deterministic previews

Render a plain buffer snapshot:

```sh
cargo run --manifest-path crates/eva-ratatui/Cargo.toml -- \
  --dump --scene earthquake --width 100 --height 29
```

Export the actual styled cell buffer as SVG:

```sh
cargo run --manifest-path crates/eva-ratatui/Cargo.toml -- \
  --svg /tmp/eva-earthquake.svg --scene earthquake --width 100 --height 29
```

SVG export is a test and comparison aid. Interactive rendering remains a normal
terminal TUI and does not require a browser, Kitty graphics, Sixel, or images.

## Integration boundary

The next phase should preserve the existing Node core instead of duplicating the
Codex app-server protocol immediately:

```text
codex app-server
       │ JSONL
       ▼
EVA Node core ── EVA renderer protocol ──> eva-ratatui
     audio, state, approvals                 cells, input
```

The renderer protocol should expose EVA-level state—stations, transcript
patches, approvals, plans, diffs, audio, and turn state—rather than raw Codex
messages. Ratatui can then be upgraded or replaced without changing the Codex
adapter, and Codex updates remain isolated from the visual layer.
