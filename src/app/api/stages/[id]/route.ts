import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN", "EDITOR"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await params;
    const body: { archived?: boolean } = await request.json();

    const existing = await prisma.testStage.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "阶段不存在", 404);

    const data: Record<string, unknown> = {};
    if (body.archived !== undefined) data.archived = body.archived;

    const updated = await prisma.testStage.update({ where: { id }, data });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      archived: updated.archived,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch {
    return internalError("更新阶段失败");
  }
}

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