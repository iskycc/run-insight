import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const body: { archived?: boolean } = await request.json();

    const existing = await prisma.testStage.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "阶段不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, existing.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权编辑该阶段", 403);

    const data: Record<string, unknown> = {};
    if (body.archived !== undefined) data.archived = body.archived;

    const updated = await prisma.testStage.update({ where: { id }, data });

    await writeAuditLog({
      userId: authResult.userId,
      action: "UPDATE",
      entityType: "stage",
      entityId: id,
      changes: data,
    });

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

  try {
    const { id } = await params;
    const existing = await prisma.testStage.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "阶段不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, existing.projectId);
    if (!access?.canAdmin) return jsonError("FORBIDDEN", "无权删除该阶段", 403);

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
