# EVA TUI design grammar

This guide defines the portable terminal interface used by EVA TUI. Its
baseline is Apple Terminal: true color and Unicode are available, but no image
protocol is assumed. Kitty graphics are an enhancement, not the source of the
layout.

## Design objective

The interface should read as an operational system assembled from text,
connectors, instruments, and state-bearing modules. It must not look like an
image reduced to colored pixels.

The visual references use geometry semantically:

- hazard rails establish a whole-screen interruption;
- solid alert plates carry the dominant event name;
- compact rectangular blocks contain measurements or coupled system states;
- vertical spines express topology and order;
- filled status blocks expose station state at the end of a connector;
- striped dossiers contain the actionable explanation;
- repeating warning fields establish threat coverage rather than illustrating
  a literal earthquake or tsunami.

Every large shape therefore needs a job. If removing a shape does not remove
hierarchy, grouping, state, or motion, the shape is probably decoration.

## Fill is structure

The upstream SVG source is deliberately simple. Its visual weight comes from
stacked fills:

- `hex_shape.svg` is a red polygon, a slightly smaller black polygon, and a
  slightly smaller red polygon;
- `long_shape.svg` uses the same red/black/red sandwich in a wider silhouette;
- station blades are one green or red parallelogram with a small orange cap;
- warning placards are black chassis with red type and solid amber stripe
  caps;
- the tsunami frame is a rounded black rectangle with filled stripe bars on
  all four edges.

The terminal replacement follows that method without requiring the large
containers to retain a polygon silhouette. Use background color for the full
surface area, reserve glyphs for thin inset rails and compact warning motifs,
and knock text into the filled surface. An outline-only version is not
equivalent: it loses the large color masses that establish hierarchy.

## Reference mapping

The portable scenes follow the organization of
`bagusindrayana/ews-concept-new`, not only its palette.

### Earthquake

1. Top and bottom `EARTHQUAKE / 地震` hazard rails make the alert global.
2. A centered solid red plate carries the warning hierarchy.
3. Paired amber warning blocks reinforce the central assembly.
4. Red magnitude and depth blocks flank an amber synchronization coupler.
5. Side `地震` placards anchor the lower cluster.
6. A striped incident dossier gives the real failure or simulation detail.

### Tsunami

1. A tiled `WARNING` hex field covers the screen. It is not a picture of a
   wave.
2. Six `津波 / ALERT` placards occupy the left and right edge zones.
3. A centered solid red warning plate carries `PERINGATAN DINI TSUNAMI`.
4. A black, striped dossier carries severity, real diff counts, propagation,
   and simulation status.
5. Linked `NODE` channels give the dossier an operational lower section.

### Station matrix

1. Several vertical ribs divide the available width.
2. Stations alternate left and right from each rib.
3. A thin connector terminates in a two-row rectangular status block.
4. Block color comes from recorded station state.
5. A compact status/event code is attached below the node.
6. Selection changes the block accent to white and exposes full detail in the
   inspector below the matrix.

The supplemental `nerv-ui` references reinforce thin chassis borders, attached
labels, linked stacks, phase lists, lifelines, and MAGI-like topology. They do
not justify generic rounded dashboard cards, arbitrary radar circles, or
poster-sized typography inside normal operational screens.

## Portable primitive vocabulary

| Primitive | Terminal construction | Meaning |
| --- | --- | --- |
| Hazard rail | background color, `/` and `\`, repeated text | global alert scope |
| Alert plate | solid red/amber background, inset black rails, real text | dominant event |
| Data block | solid rectangular fill, label and value | measurement or coupled state |
| Placard | rounded black chassis, amber caps, Kanji | distributed alert node |
| Dossier | rounded box, tight `◢◤` / `◣◥` rails on all four edges, nested rows | actionable detail |
| Warning field | repeated filled `WARNING` hex cells | spatial threat coverage |
| Rib | `┃`, `┫`, `┣`, `━`, two-row filled status block | system topology |
| Signal channel | label, animated `━─` span, target | propagation or progress |

These primitives live in `src/ui/tui-primitives.ts`. Asset proportions and
their cell-native cap/span constructions live in
`src/ui/asset-cell-masks.ts`. Scenes compose them in
`src/ui/semantic-scenes.ts`; they should not draw arbitrary per-pixel art.

## Layout and density

The composition is based on terminal cells.

- **78–87 columns:** compact mode. Hide secondary edge modules before
  shortening the dominant headline. Keep the event, three core measurements,
  and one actionable detail.
- **88–123 columns:** standard mode. Show all earthquake side placards or all
  six tsunami placards. Use four station ribs around 94 columns.
- **124+ columns:** expanded mode. Station matrices may use five ribs. Do not
  simply add empty margins; spend width on labels and channels.
- **Below 24 rows:** compress vertical spacing and the dossier, but retain the
  dominant event, severity, and dismissal/action information.
- **24+ rows:** use the full staged assembly and nested dossier.

Operational screens should have controlled density. Large unstructured black
areas are acceptable only when they separate two strong assemblies or reserve
space for an active signal. Empty space should not come from generic padding.

## Type and language

- Use uppercase condensed-looking Latin labels through short words and tight
  spacing rather than bundled proprietary fonts.
- Use monospace data labels and fixed-width numbers.
- Kanji is a structural marker, not texture. `地震`, `津波`, `警告`, and `試験`
  must remain real double-width terminal text.
- One screen gets one dominant headline. Secondary labels should be attached
  to frames, connectors, or rails.
- Truncate state-derived strings at terminal-cell boundaries with an ellipsis.
  Do not allow a long path to break a chassis.

The cell engine accounts for East Asian double-width characters and reserves
their continuation cell. New primitives must use its text methods rather than
indexing JavaScript strings directly.

## Color semantics

- `orange`: structure, ribs, ordinary control labels;
- `amber`: caution, simulation, measurements;
- `red`: active danger, failure, highest propagation channel;
- `crimson`: dim threat field and secondary danger structure;
- `green`: nominal links and verified channels;
- `white`: selected focus and primary readable detail;
- `dim brown-gray`: inactive telemetry and secondary annotations;
- `black`: ground and text knocked out of alert fills.

Color should repeat state already expressed by text or geometry. Never make
color the only indication of failure, selection, or simulation.

## Motion

Animation is discrete and stateful:

- hazard stripes shift by one terminal cell;
- danger color pulses between red and amber;
- propagation channels extend and reset;
- the selected station marker blinks;
- scene elements may reveal in ordered stages.

Avoid full-screen random noise, continuous raster redraws, and motion that
changes line width. The frame should remain legible in a static screenshot and
when terminal refresh is slow.

Geometry runs as a bounded staged sequence and then settles. A new alert,
turn, station view, or station selection restarts that sequence. Active
semantic scenes also maintain a low-frequency operational phase for rails and
signals. That phase is owned by the scene leaf rather than the whole
application, and Ink's incremental renderer discards unchanged lines.
Terminal-driven SGR blink remains available for selected markers.

Do not leave the full application on a 30–60 FPS JavaScript timer. Persistent
motion should stay below a few frames per second, be scoped to the active
scene, and change only a small number of rows. Idle Operations, Impact, and
Transcript displays have no application animation timer.

## Functional binding

Visual modules must bind to Codex data:

- station blocks use connection, turn, command, git, diff, tool, MCP, agent,
  context, approval, and audio state;
- station event codes use recorded event counts;
- earthquake dossiers use the actual diagnostic or failed activity label;
- tsunami dossiers use real changed-file and line counts when available;
- synchronization rails use actual plan completion;
- approval alerts show the proposed operation and derived risk.

Fixture data is allowed only in screens explicitly marked `試験 / SIMULATION`.

## Backend separation

The scene meaning is shared, but the renderers are separate:

```text
Codex state
    ├── semantic scene hierarchy
    │       └── filled cells + compact SVG-derived motifs → every terminal
    └── SVG asset composition    → Kitty PNG placement       → capable terminals
```

The portable renderer does not rasterize a complete SVG scene or screenshot.
It retains the source layouts' hierarchy, color mass, connected topology, and
warning rhythm. Large text-bearing containers become gapless rectangular cell
fills; compact warning motifs may still use source-derived masks. This keeps
Apple Terminal output searchable and selectable without asking font glyphs to
form continuous polygon edges. Kitty assets may be richer, but both backends
must preserve the same scene hierarchy and state labels.

## Anti-patterns

- converting a complete screenshot or scene into quadrant, half-block, or
  Braille pixels instead of porting a small functional shape;
- using a literal wave to represent the tsunami scene;
- adding a circular radar when the reference uses a tiled field or rib
  topology;
- rounded SaaS-style cards;
- placing labels in floating boxes unrelated to the structure;
- repeating chevrons on every panel;
- mixing emergency broadcast, camera overlay, and title-card families in one
  screen;
- copying copyrighted screenshots, logos, fonts, or music into the project.

## Visual QA

Generate deterministic previews:

```sh
npm run preview:tui
```

By default the script writes PNG and SVG previews to
`/tmp/eva-tui-previews`. Pass a directory as the first argument to retain a
review set:

```sh
pnpm preview:tui -- ./artifacts/tui-previews
```

Review at least the standard `100×29` warning scenes, the `94×20` station
matrix, and both compact `78×21` scenes. Check:

1. no text collision or accidental wrap;
2. Kanji occupies the correct two-cell width;
3. the dominant event is readable before supporting data;
4. state remains understandable without color;
5. compact mode preserves action and severity;
6. no Braille or quadrant raster texture appears.

Then run:

```sh
pnpm typecheck
pnpm test
pnpm build
```
