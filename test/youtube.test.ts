import assert from "node:assert/strict";
import test from "node:test";

import {
  extractYoutubeVideoId,
  YoutubeCompanion,
} from "../src/audio/youtube.js";

const TRACK_URL = "https://music.youtube.com/watch?v=3BqrH0BzqSo";

function siblingUrl(playerUrl: string, path: string): URL {
  const source = new URL(playerUrl);
  const target = new URL(path, source);
  target.search = source.search;
  return target;
}

test("extracts supported YouTube URL forms", () => {
  assert.equal(extractYoutubeVideoId(TRACK_URL), "3BqrH0BzqSo");
  assert.equal(
    extractYoutubeVideoId("https://www.youtube.com/watch?v=3BqrH0BzqSo"),
    "3BqrH0BzqSo",
  );
  assert.equal(
    extractYoutubeVideoId("https://youtu.be/3BqrH0BzqSo"),
    "3BqrH0BzqSo",
  );
  assert.equal(extractYoutubeVideoId("3BqrH0BzqSo"), "3BqrH0BzqSo");
});

test("rejects untrusted or malformed playback sources", () => {
  assert.throws(
    () => extractYoutubeVideoId("https://example.com/watch?v=3BqrH0BzqSo"),
    /Only youtube\.com/,
  );
  assert.throws(
    () => extractYoutubeVideoId("http://youtube.com/watch?v=3BqrH0BzqSo"),
    /HTTPS/,
  );
  assert.throws(
    () => extractYoutubeVideoId("https://youtube.com/watch?v=short"),
    /valid video ID/,
  );
});

test("serves a protected official player and relays TUI commands", async () => {
  const companion = new YoutubeCompanion(TRACK_URL, { openBrowser: false });
  const statuses: string[] = [];
  companion.on("status", (status: string) => statuses.push(status));

  try {
    await companion.setEnabled(true);
    const playerUrl = companion.playerUrl;
    assert.match(playerUrl, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/);

    const pageResponse = await fetch(playerUrl);
    assert.equal(pageResponse.status, 200);
    assert.match(
      pageResponse.headers.get("content-security-policy") ?? "",
      /frame-src https:\/\/www\.youtube\.com/,
    );
    const page = await pageResponse.text();
    assert.match(page, /3BqrH0BzqSo/);
    assert.match(page, /https:\/\/www\.youtube\.com\/iframe_api/);
    assert.match(page, /ENABLE AUDIO \/ 音声開始/);
    assert.match(page, /OPEN IN YOUTUBE MUSIC \/ 外部再生/);
    assert.match(page, /embedding disabled by owner/);
    assert.match(page, /min-width: 200px; min-height: 200px/);
    assert.match(page, /does not download, extract, or cache media/);

    const untrusted = new URL(playerUrl);
    untrusted.search = "";
    assert.equal((await fetch(untrusted)).status, 403);

    const controller = new AbortController();
    const eventResponse = await fetch(siblingUrl(playerUrl, "/events"), {
      signal: controller.signal,
    });
    assert.equal(eventResponse.status, 200);
    assert.ok(eventResponse.body);
    const reader = eventResponse.body.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    assert.match(decoder.decode(first.value), /"command":"play"/);

    await companion.setEnabled(false);
    const second = await reader.read();
    assert.match(decoder.decode(second.value), /"command":"pause"/);

    const stateResponse = await fetch(siblingUrl(playerUrl, "/state"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "playing" }),
    });
    assert.equal(stateResponse.status, 204);
    assert.ok(statuses.includes("YOUTUBE PLAYING"));

    controller.abort();
  } finally {
    companion.dispose();
  }
});

test("opens the companion once and survives immediate shutdown", async () => {
  const opened: string[] = [];
  const companion = new YoutubeCompanion(TRACK_URL, {
    opener: (url) => opened.push(url),
  });

  await companion.setEnabled(true);
  await companion.setEnabled(true);
  assert.equal(opened.length, 1);
  assert.equal(opened[0], companion.playerUrl);
  companion.dispose();

  const early = new YoutubeCompanion(TRACK_URL, { openBrowser: false });
  const pendingStart = early.setEnabled(true);
  early.dispose();
  await assert.rejects(pendingStart, /closed before startup/);
});
