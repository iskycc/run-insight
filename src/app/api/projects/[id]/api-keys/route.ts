import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import crypto from "crypto";
import type { ApiKeyCreateResponse, ApiKeysListResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await params;
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

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await params;
    const body: { description: string } = await request.json();

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "项目不存在", 404);

    const rawKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const record = await prisma.apiKey.create({
      data: { projectId: id, userId: authResult.userId, keyHash, description: body.description || "" },
      select: { id: true, description: true, createdAt: true },
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