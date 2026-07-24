export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue | undefined };
export type RequestId = string | number;

export interface WireMessage extends JsonObject {
  id?: RequestId;
  method?: string;
  params?: JsonValue;
  result?: JsonValue;
  error?: JsonValue;
}

export interface CodexNotification {
  method: string;
  params: JsonObject;
}

export interface ServerRequest {
  id: RequestId;
  method: string;
  params: JsonObject;
}

export type ApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

export function stringifyCompact(value: unknown, limit = 320): string {
  if (typeof value === "string") {
    return truncate(value, limit);
  }

  try {
    return truncate(JSON.stringify(value, null, 2), limit);
  } catch {
    return "[unprintable data]";
  }
}
