export const theme = {
  orange: "#ff9d00",
  amber: "#ffc247",
  red: "#ff3b21",
  crimson: "#b51224",
  purple: "#7f5af0",
  green: "#2ee66b",
  cyan: "#3ce6e6",
  white: "#f6ead7",
  dim: "#806f5f",
  black: "#090807",
} as const;

export function statusColor(status: string): string {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized.includes("declin")
  ) {
    return theme.red;
  }
  if (
    normalized.includes("complete") ||
    normalized.includes("success") ||
    normalized.includes("ready")
  ) {
    return theme.green;
  }
  if (normalized.includes("run") || normalized.includes("progress")) {
    return theme.orange;
  }
  return theme.dim;
}
