import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
  parseOptionalBooleanSearchParam,
  parseRequestUrl,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const parsedBody = await parseJsonObject(request, ["archived"]);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    if (typeof body.archived !== "boolean") {
      return jsonError("VALIDATION_ERROR", "归档状态必须为布尔值");
    }

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "项目不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, id);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权编辑该项目", 403);

    const data = { archived: body.archived };

    const updated = await prisma.project.update({ where: { id }, data });

    await writeAuditLog({
      userId: authResult.userId,
      action: body.archived === true
        ? "ARCHIVE"
        : body.archived === false
          ? "UNARCHIVE"
          : "UPDATE",
      entityType: "project",
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
  } catch (error) {
    return internalError("更新项目失败", {
      request,
      error,
      event: "project.update_failed",
      context: { userId: authResult.userId },
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;
  let permanent = false;

  try {
    const parsedUrl = parseRequestUrl(request);
    if (!parsedUrl.ok) return parsedUrl.response;
    const permanentParam = parseOptionalBooleanSearchParam(
      parsedUrl.value.searchParams,
      "permanent",
    );
    if (!permanentParam.ok) return permanentParam.response;
    permanent = permanentParam.value;
    const { id } = await params;
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "项目不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, id);
    if (permanent ? !access?.canAdmin : !access?.canEdit) {
      return jsonError(
        "FORBIDDEN",
        permanent ? "无权永久删除该项目" : "无权将该项目移至回收站",
        403
      );
    }
    if (permanent) {
      if (!existing.archived) {
        return jsonError(
          "CONFLICT",
          "请先将项目移至回收站，再执行永久删除",
          409
        );
      }

      await prisma.project.delete({ where: { id } });

      await writeAuditLog({
        userId: authResult.userId,
        action: "DELETE",
        entityType: "project",
        entityId: id,
        changes: { permanent: true, name: existing.name },
      });

      return NextResponse.json({ deleted: true, permanent: true });
    }

    if (!existing.archived) {
      await prisma.project.update({
        where: { id },
        data: { archived: true },
      });

      await writeAuditLog({
        userId: authResult.userId,
        action: "ARCHIVE",
        entityType: "project",
        entityId: id,
        changes: { archived: true, movedToTrash: true },
      });
    }

    return NextResponse.json({
      deleted: true,
      archived: true,
      permanent: false,
    });
  } catch (error) {
    return internalError(
      permanent ? "永久删除项目失败" : "将项目移至回收站失败",
      {
        request,
        error,
        event: permanent
          ? "project.permanent_delete_failed"
          : "project.trash_failed",
        context: { userId: authResult.userId },
      },
    );
  }
}
