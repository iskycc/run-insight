import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import crypto from "crypto";
import type { ApiKeyCreateResponse, ApiKeysListResponse } from "@/types";
import { getProjectAccess } from "@/lib/project-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const access = await getProjectAccess(prisma, authResult.userId, id);
    if (!access?.canAdmin) return jsonError("FORBIDDEN", "无权管理该项目的 API Key", 403);
    const keys = await prisma.apiKey.findMany({
      where: { projectId: id },
      select: { id: true, description: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json<ApiKeysListResponse>({
      keys: keys.map((k) => ({
        id: k.id,
        description: k.description,
        createdAt: k.createdAt.toISOString(),
      })),
    });
  } catch {
    return internalError("获取 API Key 列表失败");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const body: { description: string } = await request.json();

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "项目不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, id);
    if (!access?.canAdmin) return jsonError("FORBIDDEN", "无权管理该项目的 API Key", 403);

    const rawKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const record = await prisma.apiKey.create({
      data: { projectId: id, userId: authResult.userId, keyHash, description: body.description || "" },
      select: { id: true, description: true, createdAt: true },
    });
    await writeAuditLog({
      userId: authResult.userId,
      action: "CREATE",
      entityType: "apiKey",
      entityId: record.id,
      changes: { projectId: id, description: record.description },
    });

    return NextResponse.json<ApiKeyCreateResponse>({
      id: record.id,
      key: rawKey,
      description: record.description,
      createdAt: record.createdAt.toISOString(),
    }, { status: 201 });
  } catch {
    return internalError("创建 API Key 失败");
  }
}
