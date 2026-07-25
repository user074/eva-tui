import type { ConversationSynchronizationState } from "./model.js";

export const INITIAL_CONVERSATION_SYNCHRONIZATION = 18;
export const HUMAN_RESPONSE_GRACE_MS = 30_000;
export const SYNCHRONIZATION_DECAY_POINT_MS = 10_000;
export const MAX_INPUT_WORDS = 20;
export const MAX_INPUT_SYNCHRONIZATION_INCREASE = 10;
export const DISPLAY_SYNCHRONIZATION_MAX_STEP = 0.15;

export interface ConversationSynchronizationSnapshot {
  percent: number;
  status: "ACQUIRING" | "CODEX ACTIVE" | "AWAITING HUMAN" | "LINK DECAY";
  waitingMs: number;
  lastResponseMs: number | null;
  exchanges: number;
  lastInputWords: number;
  lastInputIncrease: number;
}

const wordSegmenter = new Intl.Segmenter(undefined, {
  granularity: "word",
});

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function inputWordCount(input: string): number {
  return [...wordSegmenter.segment(input)].filter(
    (segment) => segment.isWordLike,
  ).length;
}

export function inputSynchronizationIncrease(input: string): number {
  const words = Math.min(MAX_INPUT_WORDS, inputWordCount(input));
  return (
    (words / MAX_INPUT_WORDS) *
    MAX_INPUT_SYNCHRONIZATION_INCREASE
  );
}

export function easeDisplayedSynchronization(
  current: number,
  target: number,
): number {
  const distance = clampPercent(target) - clampPercent(current);
  if (Math.abs(distance) < 0.02) return clampPercent(target);
  const step =
    Math.sign(distance) *
    Math.min(
      Math.abs(distance) * 0.08,
      DISPLAY_SYNCHRONIZATION_MAX_STEP,
    );
  return clampPercent(current + step);
}

export function conversationSynchronizationAt(
  synchronization: ConversationSynchronizationState,
  now: number,
): ConversationSynchronizationSnapshot {
  const waitingMs =
    synchronization.awaitingHumanSince === null
      ? 0
      : Math.max(0, now - synchronization.awaitingHumanSince);
  const decayMs = Math.max(0, waitingMs - HUMAN_RESPONSE_GRACE_MS);
  const decayPoints = decayMs / SYNCHRONIZATION_DECAY_POINT_MS;
  const percent = clampPercent(synchronization.percent - decayPoints);
  const status =
    synchronization.awaitingHumanSince !== null
      ? decayMs > 0
        ? "LINK DECAY"
        : "AWAITING HUMAN"
      : synchronization.updatedAt === null
        ? "ACQUIRING"
        : "CODEX ACTIVE";

  return {
    percent,
    status,
    waitingMs,
    lastResponseMs: synchronization.lastResponseMs,
    exchanges: synchronization.exchanges,
    lastInputWords: synchronization.lastInputWords,
    lastInputIncrease: synchronization.lastInputIncrease,
  };
}

export function recordOperatorMessage(
  synchronization: ConversationSynchronizationState,
  at: number,
  input: string,
): ConversationSynchronizationState {
  const responseMs =
    synchronization.awaitingHumanSince === null
      ? null
      : Math.max(0, at - synchronization.awaitingHumanSince);
  const current = conversationSynchronizationAt(synchronization, at).percent;
  const lastInputWords = inputWordCount(input);
  const lastInputIncrease = inputSynchronizationIncrease(input);
  const percent = clampPercent(current + lastInputIncrease);

  return {
    percent,
    updatedAt: at,
    awaitingHumanSince: null,
    lastResponseMs: responseMs ?? synchronization.lastResponseMs,
    exchanges: synchronization.exchanges + 1,
    lastInputWords,
    lastInputIncrease,
  };
}

export function recordCodexYield(
  synchronization: ConversationSynchronizationState,
  at: number,
): ConversationSynchronizationState {
  const current = conversationSynchronizationAt(synchronization, at).percent;
  return {
    ...synchronization,
    percent: current,
    updatedAt: at,
    awaitingHumanSince:
      synchronization.awaitingHumanSince ?? at,
  };
}
