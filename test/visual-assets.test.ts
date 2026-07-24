import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const visualRoot = join(import.meta.dirname, "..", "assets", "visual");

test("visual console is local, functional, and reference-grounded", async () => {
  const [html, css, referenceCss, javascript] = await Promise.all([
    readFile(join(visualRoot, "index.html"), "utf8"),
    readFile(join(visualRoot, "app.css"), "utf8"),
    readFile(join(visualRoot, "reference.css"), "utf8"),
    readFile(join(visualRoot, "app.js"), "utf8"),
  ]);

  assert.match(html, /CODEX OPERATIONS CONSOLE/);
  assert.match(html, /data-scene="stations"/);
  assert.match(html, /id="commandForm"/);
  assert.doesNotMatch(html, /https?:\/\//);

  assert.match(css, /\/ews\/warning_hex_red\.png/);
  assert.match(css, /station-spine/);
  assert.match(css, /alert-rail/);
  assert.match(referenceCss, /RibCageLayout/);
  assert.match(referenceCss, /warning_hex_red\.png/);
  assert.match(referenceCss, /hexagons\.svg/);

  assert.match(javascript, /\/api\/action/);
  assert.match(javascript, /\/events\?token=/);
  assert.match(javascript, /SkewRectangle_Green\.svg/);
  assert.match(javascript, /warning_tsunami_yellow\.png/);
  assert.match(javascript, /warning_gempa_black\.svg/);
  assert.match(javascript, /hex_shape_orange\.svg/);
  assert.doesNotMatch(javascript, /fetch\(["']https?:\/\//);
});
