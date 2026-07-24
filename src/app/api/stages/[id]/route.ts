import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await params;
    const existing = await prisma.testStage.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "阶段不存在", 404);

    await prisma.testStage.delete({ where: { id } });

    await writeAuditLog({
      userId: authResult.userId,
      action: "DELETE",
      entityType: "stage",
      entityId: id,
    });

    return NextResponse.json({ deleted: true });
  } catch {
    return internalError("删除阶段失败");
  }
}