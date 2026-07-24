import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import test from "node:test";

import { createAmbientLoop } from "../src/audio/procedural.js";

test("generated fallback is a valid original PCM WAV", () => {
  const path = createAmbientLoop();
  try {
    const bytes = readFileSync(path);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
    assert.equal(bytes.readUInt16LE(20), 1);
    assert.equal(bytes.readUInt16LE(22), 1);
    assert.ok(bytes.length > 44);
  } finally {
    unlinkSync(path);
  }
});
