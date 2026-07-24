# EVA visual console architecture

The visual console is a second renderer, not a Codex fork and not a hosted web
application.

```text
browser renderer
      │ token-protected HTTP + server-sent events on 127.0.0.1
      ▼
VisualSession ── AppState / reducer / operations model
      │
      ├── AudioDirector
      └── CodexClient ── JSONL over stdio ── codex app-server
```

## Boundary

`src/codex` owns the evolving Codex app-server protocol. `src/state` reduces
protocol events into UI-independent state. The TUI and graphical console are
renderers around those layers, so a Codex update should normally require an
adapter change in `src/codex` rather than a visual rewrite.

`src/visual/session.ts` translates graphical actions into the same thread,
turn, interrupt, approval, and audio operations used by the TUI.
`src/visual/server.ts` exposes that session only to the local renderer.
`assets/visual` contains the dependency-free HTML, CSS, and JavaScript.

The server:

- binds to `127.0.0.1`, never all network interfaces;
- generates a new random bearer token on each launch;
- requires that token for state, event, and action endpoints;
- applies a restrictive content security policy and disables framing;
- applies a request-body limit;
- serves only an explicit allowlist of visual and upstream assets.

## Reference-grounded visual organization

The graphical warning scenes use components from
`bagusindrayana/ews-concept-new` as an assembled interface:

- The tsunami state uses the tiled warning hex field, four moving hazard
  rails, a central long-hex title, and six distributed warning placards.
- The earthquake state uses paired black warning panels, a dominant warning
  title, three central hex data modules, and a lower incident strip.
- The station matrix alternates real green or red skew-blade assets around a
  segmented orange spine. Node labels and statuses come from live Codex state.

This organization intentionally avoids interpreting “tsunami” as a literal
wave illustration or treating the assets as unrelated decorations.

## Current functional scope

The first version supports new threads, streamed agent messages, plans,
activity, token use, diffs, MCP status, command submission, interruption,
command/file/permission approvals, local visual simulations, and audio
control.

History/resume, interactive `requestUserInput`, MCP elicitation, and
client-hosted dynamic tools remain future protocol adapters. Unsupported
server requests receive an explicit error rather than being left unresolved.
