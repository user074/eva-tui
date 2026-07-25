import assert from "node:assert/strict";
import test from "node:test";

import type { PendingApproval } from "../src/state/model.js";
import { initialState } from "../src/state/model.js";
import {
  approvalSeverity,
  buildStations,
  cycleScene,
  impactNodes,
  operationSpine,
  planProgress,
  propagationNodes,
} from "../src/ui/operations-model.js";

test("scene navigation cycles in both directions", () => {
  assert.equal(cycleScene("operations"), "stations");
  assert.equal(cycleScene("operations", -1), "transcript");
  assert.equal(cycleScene("transcript"), "operations");
});

test("plan progress is derived only from plan status", () => {
  const state = {
    ...initialState,
    plan: [
      { step: "Inspect", status: "completed" },
      { step: "Build", status: "completed" },
      { step: "Verify", status: "in_progress" },
      { step: "Report", status: "pending" },
    ],
  };

  assert.deepEqual(planProgress(state), {
    completed: 2,
    total: 4,
    percent: 50,
  });
});

test("station matrix groups recorded activities into functional links", () => {
  const state = {
    ...initialState,
    connection: "online" as const,
    model: "gpt-test",
    threadId: "thread-1",
    activity: [
      {
        id: "command-1",
        type: "commandExecution",
        label: "pnpm test",
        status: "completed",
      },
      {
        id: "git-1",
        type: "commandExecution",
        label: "git status --short",
        status: "running",
      },
      {
        id: "file-1",
        type: "fileChange",
        label: "2 file changes",
        status: "completed",
      },
    ],
  };

  const stations = buildStations(state, "OFF");
  assert.equal(stations.find((station) => station.id === "shell")?.eventCount, 1);
  assert.equal(stations.find((station) => station.id === "git")?.status, "RUNNING");
  assert.equal(stations.find((station) => station.id === "workspace")?.eventCount, 1);
});

test("impact nodes preserve real diff paths and group directories", () => {
  const state = {
    ...initialState,
    diff: {
      additions: 4,
      deletions: 1,
      files: ["src/app.tsx", "README.md"],
    },
  };

  assert.deepEqual(impactNodes(state), [
    { path: "src/app.tsx", label: "app.tsx", directory: "src" },
    { path: "README.md", label: "README.md", directory: "." },
  ]);
});

test("operation spine remains active when Codex emits no formal plan", () => {
  const state = {
    ...initialState,
    turn: "running" as const,
    turnId: "turn-1",
    transcript: [
      ...initialState.transcript,
      {
        id: "operator-1",
        role: "operator" as const,
        text: "Inspect the project",
        streaming: false,
      },
    ],
    activity: [
      {
        id: "command-1",
        type: "commandExecution",
        label: "rg --files",
        status: "running",
        turnId: "turn-1",
      },
    ],
  };

  const spine = operationSpine(state);
  assert.equal(spine.source, "live");
  assert.equal(
    spine.steps.find((step) => step.step === "OPERATE SYSTEMS")?.status,
    "in_progress",
  );
});

test("propagation field uses working-set reads before any file is changed", () => {
  const state = {
    ...initialState,
    turn: "running" as const,
    turnId: "turn-1",
    activity: [
      {
        id: "command-1",
        type: "commandExecution",
        label: "sed -n 1,80p src/app.tsx",
        status: "completed",
        turnId: "turn-1",
        targets: ["src/app.tsx"],
      },
    ],
  };

  assert.deepEqual(propagationNodes(state), [
    {
      path: "src/app.tsx",
      label: "app.tsx",
      directory: "src",
      kind: "READ",
    },
  ]);
});

test("destructive and permission approvals receive critical severity", () => {
  const approval: PendingApproval = {
    id: 1,
    method: "item/commandExecution/requestApproval",
    kind: "COMMAND",
    title: "rm -r generated-output",
    detail: "Delete generated files",
    payload: {},
  };

  assert.equal(approvalSeverity(approval).level, "CRITICAL");
});
