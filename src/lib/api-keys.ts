import type {
  ApiKeyResponse,
  ApiKeyScope,
  ApiKeyStatus,
} from "@/types";

export const API_KEY_SCOPES = ["IMPORT"] as const satisfies readonly ApiKeyScope[];
const API_KEY_SCOPE_SET = new Set<string>(API_KEY_SCOPES);
const MAX_DESCRIPTION_LENGTH = 191;

type CreateApiKeyInput =
  | {
      ok: true;
      description: string;
      scopes: ApiKeyScope[];
      expiresAt: Date | null;
    }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseApiKeyScopes(value: unknown): ApiKeyScope[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (
    value.some(
      (scope) => typeof scope !== "string" || !API_KEY_SCOPE_SET.has(scope),
    )
  ) {
    return null;
  }
  if (new Set(value).size !== value.length) return null;
  return value as ApiKeyScope[];
}

export function validateCreateApiKeyInput(
  value: unknown,
  now = new Date(),
): CreateApiKeyInput {
  if (!isRecord(value)) {
    return { ok: false, error: "请求体必须是对象" };
  }
  const allowedFields = new Set(["description", "scopes", "expiresAt"]);
  const unknownField = Object.keys(value).find(
    (field) => !allowedFields.has(field),
  );
  if (unknownField) {
    return { ok: false, error: `不支持的字段：${unknownField}` };
  }

  if (typeof value.description !== "string") {
    return { ok: false, error: "描述必须是字符串" };
  }
  const description = value.description.trim();
  if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `描述不能为空且长度不能超过${MAX_DESCRIPTION_LENGTH}个字符`,
    };
  }

  const scopes = parseApiKeyScopes(value.scopes);
  if (!scopes) {
    return { ok: false, error: "权限范围必须是非空且不重复的有效数组" };
  }

  let expiresAt: Date | null = null;
  if (value.expiresAt !== undefined && value.expiresAt !== null) {
    if (
      typeof value.expiresAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
        value.expiresAt,
      )
    ) {
      return { ok: false, error: "过期时间必须是带 UTC 时区的 ISO 时间" };
    }
    expiresAt = new Date(value.expiresAt);
    const canonicalInput = value.expiresAt.includes(".")
      ? value.expiresAt
      : value.expiresAt.replace("Z", ".000Z");
    if (
      Number.isNaN(expiresAt.getTime())
      || expiresAt.toISOString() !== canonicalInput
    ) {
      return { ok: false, error: "过期时间不是有效的 UTC 时间" };
    }
    if (expiresAt <= now) {
      return { ok: false, error: "过期时间必须晚于当前时间" };
    }
  }

  return { ok: true, description, scopes, expiresAt };
}

export function getApiKeyStatus(
  key: { revokedAt: Date | null; expiresAt: Date | null },
  now = new Date(),
): ApiKeyStatus {
  if (key.revokedAt) return "REVOKED";
  if (key.expiresAt && key.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

export function serializeApiKey(
  key: {
    id: string;
    prefix: string;
    description: string;
    scopes: unknown;
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  now = new Date(),
): ApiKeyResponse {
  return {
    id: key.id,
    prefix: key.prefix,
    description: key.description,
    scopes: parseApiKeyScopes(key.scopes) ?? [],
    status: getApiKeyStatus(key, now),
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
    updatedAt: key.updatedAt.toISOString(),
  };
}
