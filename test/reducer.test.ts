import assert from "node:assert/strict";
import test from "node:test";

import type { CodexNotification, ServerRequest } from "../src/codex/protocol.js";
import {
  conversationSynchronizationAt,
  easeDisplayedSynchronization,
  inputSynchronizationIncrease,
} from "../src/state/conversation-synchronization.js";
import { initialState } from "../src/state/model.js";
import { appReducer } from "../src/state/reducer.js";

function notification(method: string, params: CodexNotification["params"]) {
  return appReducer(initialState, {
    type: "notification",
    notification: { method, params },
    at: 1_000,
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
    at: 1_100,
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
    at: 1_100,
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
    at: 1_200,
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

test("human replies raise conversation synchronization and extended waiting decays it", () => {
  const firstMessage = appReducer(initialState, {
    type: "operator-message",
    id: "operator-1",
    text: "First request",
    at: 1_000,
  });
  const codexYielded = appReducer(firstMessage, {
    type: "notification",
    notification: {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn-1",
          status: "completed",
        },
      },
    },
    at: 3_000,
  });
  const rapidReply = appReducer(codexYielded, {
    type: "operator-message",
    id: "operator-2",
    text: "Continue",
    at: 5_000,
  });

  assert.equal(rapidReply.conversationSynchronization.exchanges, 2);
  assert.equal(rapidReply.conversationSynchronization.lastResponseMs, 2_000);
  assert.ok(
    rapidReply.conversationSynchronization.percent >
      initialState.conversationSynchronization.percent,
  );

  const waitingAgain = appReducer(rapidReply, {
    type: "notification",
    notification: {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn-2",
          status: "completed",
        },
      },
    },
    at: 7_000,
  });
  const secondRapidReply = appReducer(waitingAgain, {
    type: "operator-message",
    id: "operator-3",
    text: "Keep going",
    at: 9_000,
  });
  assert.ok(
    secondRapidReply.conversationSynchronization.percent >
      rapidReply.conversationSynchronization.percent,
  );

  const waitingAfterSecondReply = appReducer(secondRapidReply, {
    type: "notification",
    notification: {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn-3",
          status: "completed",
        },
      },
    },
    at: 11_000,
  });
  const decayed = conversationSynchronizationAt(
    waitingAfterSecondReply.conversationSynchronization,
    71_000,
  );
  assert.equal(decayed.status, "LINK DECAY");
  assert.ok(
    decayed.percent <
      secondRapidReply.conversationSynchronization.percent,
  );

  const continuousDecay = conversationSynchronizationAt(
    {
      ...initialState.conversationSynchronization,
      percent: 80,
      updatedAt: 1_000,
      awaitingHumanSince: 1_000,
    },
    36_000,
  );
  assert.equal(continuousDecay.percent, 79.5);
});

test("connection starts the initial human-response decay clock", () => {
  const connected = appReducer(initialState, {
    type: "connected",
    threadId: "thread-1",
    model: "gpt-test",
    at: 1_000,
  });
  const idle = conversationSynchronizationAt(
    connected.conversationSynchronization,
    7_000,
  );
  const decayingIdle = conversationSynchronizationAt(
    connected.conversationSynchronization,
    42_000,
  );
  const quickFirstMessage = appReducer(connected, {
    type: "operator-message",
    id: "operator-1",
    text: "Start",
    at: 3_000,
  });

  assert.equal(connected.conversationSynchronization.percent, 18);
  assert.equal(connected.conversationSynchronization.awaitingHumanSince, 1_000);
  assert.equal(idle.percent, 18);
  assert.equal(decayingIdle.percent, 16.9);
  assert.equal(quickFirstMessage.conversationSynchronization.exchanges, 1);
  assert.ok(quickFirstMessage.conversationSynchronization.percent > 18);
});

test("displayed synchronization eases large and small target changes", () => {
  assert.equal(easeDisplayedSynchronization(20, 80), 20.15);
  assert.equal(easeDisplayedSynchronization(80, 20), 79.85);
  assert.equal(easeDisplayedSynchronization(79.99, 80), 80);
});

test("human input contribution scales with words and caps at ten points", () => {
  assert.equal(inputSynchronizationIncrease(""), 0);
  assert.equal(inputSynchronizationIncrease("one two three four five"), 2.5);
  assert.equal(
    inputSynchronizationIncrease(
      Array.from({ length: 10 }, () => "word").join(" "),
    ),
    5,
  );
  assert.equal(
    inputSynchronizationIncrease(
      Array.from({ length: 20 }, () => "word").join(" "),
    ),
    10,
  );
  assert.equal(
    inputSynchronizationIncrease(
      Array.from({ length: 80 }, () => "word").join(" "),
    ),
    10,
  );
});
