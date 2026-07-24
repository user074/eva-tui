import assert from "node:assert/strict";
import test from "node:test";

import type { CodexNotification, ServerRequest } from "../src/codex/protocol.js";
import { initialState } from "../src/state/model.js";
import { appReducer } from "../src/state/reducer.js";

function notification(method: string, params: CodexNotification["params"]) {
  return appReducer(initialState, {
    type: "notification",
    notification: { method, params },
  });
}

test("agent message deltas assemble into one transcript entry", () => {
  const first = notification("item/agentMessage/delta", {
    itemId: "agent-1",
    threadId: "thread-1",
    turnId: "turn-1",
    delta: "Hello ",
  });
  const second = appReducer(first, {
    type: "notification",
    notification: {
      method: "item/agentMessage/delta",
      params: {
        itemId: "agent-1",
        threadId: "thread-1",
        turnId: "turn-1",
        delta: "world",
      },
    },
  });

  const agent = second.transcript.find((entry) => entry.id === "agent-1");
  assert.equal(agent?.text, "Hello world");
  assert.equal(agent?.streaming, true);
});

test("plan, token, and diff telemetry uses protocol values", () => {
  const planned = notification("turn/plan/updated", {
    threadId: "thread-1",
    turnId: "turn-1",
    plan: [
      { step: "Inspect", status: "completed" },
      { step: "Build", status: "in_progress" },
    ],
  });
  const tokenized = appReducer(planned, {
    type: "notification",
    notification: {
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        tokenUsage: {
          total: {
            inputTokens: 120,
            outputTokens: 30,
            totalTokens: 150,
          },
          modelContextWindow: 1_000,
        },
      },
    },
  });
  const diffed = appReducer(tokenized, {
    type: "notification",
    notification: {
      method: "turn/diff/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        diff: "--- a/file\n+++ b/file\n-old\n+new\n+another",
      },
    },
  });

  assert.equal(diffed.plan[1]?.status, "in_progress");
  assert.deepEqual(diffed.tokens, {
    total: 150,
    input: 120,
    output: 30,
    contextWindow: 1_000,
  });
  assert.deepEqual(diffed.diff, {
    additions: 2,
    deletions: 1,
    files: ["file"],
  });
});

test("command approval produces a decision panel", () => {
  const request: ServerRequest = {
    id: 77,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      command: "git status --short",
      cwd: "/workspace",
      reason: "Inspect repository status",
    },
  };
  const state = appReducer(initialState, { type: "server-request", request });

  assert.equal(state.approval?.id, 77);
  assert.equal(state.approval?.kind, "COMMAND");
  assert.match(state.approval?.detail ?? "", /workspace/);
});
