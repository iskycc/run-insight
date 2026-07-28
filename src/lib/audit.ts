import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { AuditAction, AuditEntityType } from "@/types";

const SENSITIVE_CHANGE_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "jwttoken",
  "jwtsecret",
  "secret",
  "authorization",
  "cookie",
  "set-cookie",
  "key",
  "encryptionkey",
  "apikey",
  "keyhash",
  "rawkey",
]);

const MAX_CHANGE_DEPTH = 8;
const SAFE_SECURITY_MARKER_KEYS = new Set(["passwordchanged", "passwordreset"]);

export interface AuditLogInput {
  userId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  changes?: unknown;
}

type AuditClient = Pick<typeof prisma, "auditLog">;

function isSensitiveChangeKey(key: string): boolean {
  const normalized = key.replaceAll("_", "").replaceAll("-", "").toLowerCase();
  if (SAFE_SECURITY_MARKER_KEYS.has(normalized)) return false;
  return (
    SENSITIVE_CHANGE_KEYS.has(key.toLowerCase()) ||
    normalized.includes("password") ||
    normalized.includes("token") ||
    normalized.includes("secret")
  );
}

function sanitizeChanges(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  if (depth > MAX_CHANGE_DEPTH) return "[TRUNCATED]";
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeChanges(item, depth + 1, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue === undefined) continue;
    if (isSensitiveChangeKey(key)) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizeChanges(nestedValue, depth + 1, seen);
    }
  }
  return sanitized;
}

/**
 * Best-effort audit logging.
 *
 * The boolean result makes a failed write observable to request handlers while
 * deliberately keeping the main operation successful. The structured error
 * excludes changes, exception messages, credentials, and tokens.
 */
export async function writeAuditLog(
  params: AuditLogInput,
  client: AuditClient = prisma
): Promise<boolean> {
  try {
    const changes =
      params.changes === undefined || params.changes === null
        ? undefined
        : (sanitizeChanges(params.changes) as Prisma.InputJsonValue);

    await client.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        ...(changes === undefined ? {} : { changes }),
      },
    });
    return true;
  } catch (error) {
    logger.error("audit.write_failed", {
      context: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId,
      },
      error,
      safeErrorMessage: "Audit log write failed",
    });
    return false;
  }
}
