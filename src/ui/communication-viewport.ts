import type { TranscriptEntry } from "../state/model.js";

export interface CommunicationViewport {
  lines: string[];
  firstLine: number;
  lastLine: number;
  totalLines: number;
  scrollFromBottom: number;
  maxScroll: number;
}

export function communicationTranscriptText(
  entries: TranscriptEntry[],
): string {
  if (entries.length === 0) return "SYSTEM › Link initialized.";

  return entries
    .map((entry) => {
      const role =
        entry.role === "operator"
          ? "YOU"
          : entry.role === "codex"
            ? "CODEX"
            : "SYSTEM";
      const live = entry.streaming ? " · LIVE" : "";
      return `${role}${live} ›\n${entry.text || "…"}`;
    })
    .join("\n\n");
}

function wrapLine(line: string, width: number): string[] {
  const characters = Array.from(line.replaceAll("\t", "  "));
  if (characters.length === 0) return [""];

  const wrapped: string[] = [];
  let remaining = characters;
  while (remaining.length > width) {
    let breakAt = width;
    for (let index = width; index >= Math.floor(width * 0.55); index -= 1) {
      if (/\s/.test(remaining[index] ?? "")) {
        breakAt = index;
        break;
      }
    }
    wrapped.push(remaining.slice(0, breakAt).join("").trimEnd());
    remaining = remaining.slice(breakAt);
    while (remaining[0] !== undefined && /\s/.test(remaining[0])) {
      remaining = remaining.slice(1);
    }
  }
  wrapped.push(remaining.join(""));
  return wrapped;
}

export function wrapCommunicationText(text: string, width: number): string[] {
  const safeWidth = Math.max(1, Math.floor(width));
  return text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .flatMap((line) => wrapLine(line, safeWidth));
}

export function communicationViewport(
  text: string,
  width: number,
  height: number,
  requestedScrollFromBottom: number,
): CommunicationViewport {
  const safeHeight = Math.max(1, Math.floor(height));
  const allLines = wrapCommunicationText(text || "Link initialized.", width);
  const maxScroll = Math.max(0, allLines.length - safeHeight);
  const scrollFromBottom = Math.max(
    0,
    Math.min(maxScroll, Math.floor(requestedScrollFromBottom)),
  );
  const start = Math.max(
    0,
    allLines.length - safeHeight - scrollFromBottom,
  );
  const lines = allLines.slice(start, start + safeHeight);

  return {
    lines,
    firstLine: start + 1,
    lastLine: start + lines.length,
    totalLines: allLines.length,
    scrollFromBottom,
    maxScroll,
  };
}
