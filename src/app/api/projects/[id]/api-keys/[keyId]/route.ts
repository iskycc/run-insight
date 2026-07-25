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
  const authResult = authenticateRequest(request);
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

    await prisma.apiKey.delete({ where: { id: keyId } });
    await writeAuditLog({
      userId: authResult.userId,
      action: "DELETE",
      entityType: "apiKey",
      entityId: keyId,
      changes: { projectId: id, description: record.description },
    });

    return NextResponse.json({ deleted: true });
  } catch {
    return internalError("删除 API Key 失败");
  }
}
