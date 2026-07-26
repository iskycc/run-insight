import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
} from "@/lib/api-helpers";
import {
  serializeApiKey,
  validateCreateApiKeyInput,
} from "@/lib/api-keys";
import { writeAuditLog } from "@/lib/audit";
import crypto from "crypto";
import type { ApiKeyCreateResponse, ApiKeysListResponse } from "@/types";
import { getProjectAccess } from "@/lib/project-access";

const apiKeyPublicSelect = {
  id: true,
  prefix: true,
  description: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const access = await getProjectAccess(prisma, authResult.userId, id);
    if (!access?.canAdmin) return jsonError("FORBIDDEN", "无权管理该项目的 API Key", 403);
    const keys = await prisma.apiKey.findMany({
      where: { projectId: id },
      select: apiKeyPublicSelect,
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();

    return NextResponse.json<ApiKeysListResponse>({
      keys: keys.map((key) => serializeApiKey(key, now)),
    });
  } catch (error) {
    return internalError("获取 API Key 列表失败", {
      request,
      error,
      event: "api_key.list_failed",
      context: { userId: authResult.userId },
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const parsedBody = await parseJsonObject(request, [
      "description",
      "scopes",
      "expiresAt",
    ]);
    if (!parsedBody.ok) return parsedBody.response;
    const input = validateCreateApiKeyInput(parsedBody.value);
    if (!input.ok) {
      return jsonError("VALIDATION_ERROR", input.error);
    }

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "项目不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, id);
    if (!access?.canAdmin) return jsonError("FORBIDDEN", "无权管理该项目的 API Key", 403);
    if (existing.archived) {
      return jsonError("CONFLICT", "不能为已归档项目创建 API Key", 409);
    }

    const rawKey = `ri_${crypto.randomBytes(32).toString("base64url")}`;
    const prefix = rawKey.slice(0, 11);
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const record = await prisma.apiKey.create({
      data: {
        projectId: id,
        userId: authResult.userId,
        keyHash,
        prefix,
        description: input.description,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
      },
      select: apiKeyPublicSelect,
    });
    await writeAuditLog({
      userId: authResult.userId,
      action: "API_KEY_CREATE",
      entityType: "apiKey",
      entityId: record.id,
      changes: {
        projectId: id,
        prefix: record.prefix,
        description: record.description,
        scopes: input.scopes,
        expiresAt: record.expiresAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json<ApiKeyCreateResponse>(
      { ...serializeApiKey(record), key: rawKey },
      { status: 201 },
    );
  } catch (error) {
    return internalError("创建 API Key 失败", {
      request,
      error,
      event: "api_key.create_failed",
      context: { userId: authResult.userId },
    });
  }
}
