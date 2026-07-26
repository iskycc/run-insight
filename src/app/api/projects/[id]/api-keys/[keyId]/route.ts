import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id, keyId } = await params;
    const access = await getProjectAccess(prisma, authResult.userId, id);
    if (!access?.canAdmin) return jsonError("FORBIDDEN", "无权管理该项目的 API Key", 403);
    const record = await prisma.apiKey.findFirst({
      where: { id: keyId, projectId: id },
    });

    if (!record) {
      return jsonError("NOT_FOUND", "API Key 不存在", 404);
    }
    if (record.revokedAt) {
      return jsonError("CONFLICT", "API Key 已撤销", 409);
    }

    const revokedAt = new Date();
    const result = await prisma.apiKey.updateMany({
      where: { id: keyId, projectId: id, revokedAt: null },
      data: { revokedAt },
    });
    if (result.count !== 1) {
      return jsonError("CONFLICT", "API Key 已撤销", 409);
    }
    await writeAuditLog({
      userId: authResult.userId,
      action: "API_KEY_REVOKE",
      entityType: "apiKey",
      entityId: keyId,
      changes: {
        projectId: id,
        prefix: record.prefix,
        description: record.description,
        scopes: record.scopes,
        revokedAt: revokedAt.toISOString(),
      },
    });

    return NextResponse.json({
      revoked: true,
      revokedAt: revokedAt.toISOString(),
    });
  } catch (error) {
    return internalError("撤销 API Key 失败", {
      request,
      error,
      event: "api_key.revoke_failed",
      context: { userId: authResult.userId },
    });
  }
}
