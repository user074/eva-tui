import assert from "node:assert/strict";
import test from "node:test";

import { renderGraphicPng } from "../src/graphics/compositions.js";
import {
  kittyPlaceholder,
  kittyTransmitPng,
  resolveGraphicsBackend,
  supportsKittyGraphicsEnvironment,
} from "../src/graphics/kitty.js";

test("graphics auto-detection is conservative and can be overridden", () => {
  assert.equal(
    resolveGraphicsBackend("auto", {
      TERM: "xterm-kitty",
      KITTY_WINDOW_ID: "1",
    }),
    "kitty",
  );
  assert.equal(
    resolveGraphicsBackend("auto", {
      TERM_PROGRAM: "ghostty",
    }),
    "kitty",
  );
  assert.equal(
    resolveGraphicsBackend("auto", {
      TERM: "screen-256color",
      KITTY_WINDOW_ID: "1",
      TMUX: "/tmp/tmux-501/default,1,0",
    }),
    "text",
  );
  assert.equal(resolveGraphicsBackend("kitty", { TERM: "dumb" }), "kitty");
  assert.equal(resolveGraphicsBackend("text", { TERM: "xterm-kitty" }), "text");
});

test("Kitty graphics environments are identified without unsafe generic matches", () => {
  assert.equal(
    supportsKittyGraphicsEnvironment({ TERM_PROGRAM: "WezTerm" }),
    true,
  );
  assert.equal(
    supportsKittyGraphicsEnvironment({ TERM: "xterm-ghostty" }),
    true,
  );
  assert.equal(
    supportsKittyGraphicsEnvironment({ TERM_PROGRAM: "Apple_Terminal" }),
    false,
  );
  assert.equal(
    supportsKittyGraphicsEnvironment({ TERM: "xterm-256color" }),
    false,
  );
});

test("Kitty PNG transport chunks payload and creates a virtual placement", () => {
  const png = Buffer.alloc(8_000, 0xa5);
  const output = kittyTransmitPng(png, {
    imageId: 232,
    columns: 80,
    rows: 20,
  });

  assert.match(output, /\u001b_Ga=t,f=100,i=232,q=2,N=1,m=1;/);
  assert.match(output, /\u001b_Gq=2,m=0;/);
  assert.match(output, /\u001b_Ga=p,U=1,i=232,c=80,r=20,q=2;/);
});

test("Kitty placeholder occupies the requested text-cell rectangle", () => {
  const placeholder = kittyPlaceholder(232, 12, 4);
  const lines = placeholder.split("\n");
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.equal(
      Array.from(line).filter((character) => character.codePointAt(0) === 0x10eeee)
        .length,
      12,
    );
  }
});

test("reference-grounded tsunami composition renders a valid PNG", async () => {
  const png = await renderGraphicPng({
    scene: "tsunami",
    columns: 84,
    rows: 18,
  });

  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.length > 10_000);
});
