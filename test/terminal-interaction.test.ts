import assert from "node:assert/strict";
import test from "node:test";

import {
  communicationTranscriptText,
  communicationViewport,
  wrapCommunicationText,
} from "../src/ui/communication-viewport.js";
import {
  DISABLE_TERMINAL_MOUSE,
  ENABLE_TERMINAL_MOUSE,
  parseTerminalMouseEvent,
  parseTerminalMouseWheel,
} from "../src/ui/terminal-mouse.js";

test("communication transcript includes every message and its role", () => {
  const transcript = communicationTranscriptText([
    { id: "1", role: "operator", text: "First request." },
    { id: "2", role: "codex", text: "First response.", streaming: true },
    { id: "3", role: "system", text: "System notice." },
  ]);

  assert.match(transcript, /YOU ›\nFirst request\./);
  assert.match(transcript, /CODEX · LIVE ›\nFirst response\./);
  assert.match(transcript, /SYSTEM ›\nSystem notice\./);
});

test("communication text wraps and scrolls relative to the newest line", () => {
  assert.deepEqual(wrapCommunicationText("alpha beta gamma", 10), [
    "alpha beta",
    "gamma",
  ]);

  const bottom = communicationViewport("one\ntwo\nthree\nfour", 20, 2, 0);
  assert.deepEqual(bottom.lines, ["three", "four"]);
  assert.equal(bottom.firstLine, 3);

  const older = communicationViewport("one\ntwo\nthree\nfour", 20, 2, 1);
  assert.deepEqual(older.lines, ["two", "three"]);
  assert.equal(older.scrollFromBottom, 1);
});

test("SGR mouse wheel reports direction and terminal coordinates", () => {
  assert.match(ENABLE_TERMINAL_MOUSE, /\[\?1002h/);
  assert.match(ENABLE_TERMINAL_MOUSE, /\[\?1007h/);
  assert.match(DISABLE_TERMINAL_MOUSE, /\[\?1002l/);
  assert.deepEqual(parseTerminalMouseWheel("[<64;12;8M"), {
    direction: "up",
    column: 12,
    row: 8,
  });
  assert.deepEqual(parseTerminalMouseWheel("\u001B[<65;4;20M"), {
    direction: "down",
    column: 4,
    row: 20,
  });
  assert.equal(parseTerminalMouseWheel("[<0;12;8M"), null);
});

test("SGR mouse button reports are recognized so they cannot enter the composer", () => {
  assert.deepEqual(parseTerminalMouseEvent("[<0;60;28M"), {
    kind: "button",
    button: 0,
    action: "press",
    column: 60,
    row: 28,
  });
  assert.deepEqual(parseTerminalMouseEvent("[<0;60;28m"), {
    kind: "button",
    button: 0,
    action: "release",
    column: 60,
    row: 28,
  });
});
