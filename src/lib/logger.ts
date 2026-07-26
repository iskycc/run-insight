import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogDetails {
  requestId?: string | null;
  context?: Record<string, unknown>;
  error?: unknown;
  safeErrorMessage?: string;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_DEPTH = 8;
const MAX_STRING_LENGTH = 2_000;
const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "password",
  "currentpassword",
  "newpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "jwttoken",
  "jwtsecret",
  "secret",
  "key",
  "apikey",
  "privatekey",
  "keyhash",
  "rawkey",
  "credential",
  "credentials",
  "databaseurl",
]);

function normalizeKey(key: string): string {
  return key.replaceAll("_", "").replaceAll("-", "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.includes("password") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.endsWith("credential")
  );
}

function truncate(value: string, maxLength = MAX_STRING_LENGTH): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}…[TRUNCATED]`
    : value;
}

function safeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  const candidate =
    typeof code === "string" || typeof code === "number" ? String(code) : "";
  return ERROR_CODE_PATTERN.test(candidate) ? candidate : undefined;
}

function serializeError(
  error: unknown,
  safeMessage?: string,
): Record<string, unknown> {
  const name =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name)
      ? error.name
      : "UnknownError";
  const code = safeErrorCode(error);
  const serialized: Record<string, unknown> = { name };

  if (code) serialized.code = code;
  if (safeMessage) serialized.message = truncate(safeMessage, 256);

  if (
    process.env.NODE_ENV !== "production" &&
    error instanceof Error &&
    error.stack
  ) {
    // The first stack line contains Error.message and may hold secrets.
    const frames = error.stack.split("\n").slice(1, 11).join("\n");
    if (frames) serialized.stack = truncate(frames, 4_000);
  }
  return serialized;
}

function sanitize(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") return truncate(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return undefined;
  if (typeof value === "symbol" || typeof value === "function") {
    return "[UNSUPPORTED]";
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, 100)
      .map((item) => sanitize(item, depth + 1, seen));
    if (value.length > 100) items.push("[TRUNCATED]");
    return items;
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value);
  for (const [key, nestedValue] of entries.slice(0, 100)) {
    if (nestedValue === undefined) continue;
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : sanitize(nestedValue, depth + 1, seen);
  }
  if (entries.length > 100) result._truncated = true;
  return result;
}

export function isValidRequestId(value: string | null | undefined): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function resolveRequestId(value?: string | null): string {
  return isValidRequestId(value) ? value : randomUUID();
}

export function requestIdFrom(
  request?: Pick<Request, "headers"> | null,
): string {
  return resolveRequestId(request?.headers.get("x-request-id"));
}

export function writeLog(
  level: LogLevel,
  event: string,
  details: LogDetails = {},
): void {
  const record: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    event: /^[A-Za-z0-9_.:-]{1,128}$/.test(event)
      ? event
      : "application.log",
    requestId: resolveRequestId(details.requestId),
  };
  if (details.context) {
    try {
      record.context = sanitize(details.context);
    } catch {
      record.context = "[UNSERIALIZABLE]";
    }
  }
  if (details.error !== undefined) {
    try {
      record.error = serializeError(details.error, details.safeErrorMessage);
    } catch {
      record.error = {
        name: "UnknownError",
        ...(details.safeErrorMessage
          ? { message: truncate(details.safeErrorMessage, 256) }
          : {}),
      };
    }
  }

  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (level === "debug") {
    console.debug(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  debug(event: string, details?: LogDetails) {
    writeLog("debug", event, details);
  },
  info(event: string, details?: LogDetails) {
    writeLog("info", event, details);
  },
  warn(event: string, details?: LogDetails) {
    writeLog("warn", event, details);
  },
  error(event: string, details?: LogDetails) {
    writeLog("error", event, details);
  },
};
