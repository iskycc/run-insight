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

    const existing = await prisma.testStage.findUnique({
      where: { id },
      include: { project: { select: { archived: true } } },
    });
    if (!existing) return jsonError("NOT_FOUND", "阶段不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, existing.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权编辑该阶段", 403);
    if (existing.project?.archived) {
      return jsonError("CONFLICT", "请先恢复阶段所属项目", 409);
    }
    if (
      existing.archived &&
      !(
        Object.keys(body).length === 1 &&
        body.archived === false
      )
    ) {
      return jsonError("CONFLICT", "已归档阶段只能执行恢复操作", 409);
    }

    const data = { archived: body.archived };

    const updated = await prisma.testStage.update({ where: { id }, data });

    await writeAuditLog({
      userId: authResult.userId,
      action: body.archived === true
        ? "ARCHIVE"
        : body.archived === false
          ? "UNARCHIVE"
          : "UPDATE",
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
  } catch (error) {
    return internalError("更新阶段失败", {
      request,
      error,
      event: "stage.update_failed",
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
    const existing = await prisma.testStage.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "阶段不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, existing.projectId);
    if (permanent ? !access?.canAdmin : !access?.canEdit) {
      return jsonError(
        "FORBIDDEN",
        permanent ? "无权永久删除该阶段" : "无权将该阶段移至回收站",
        403
      );
    }

    if (permanent) {
      if (!existing.archived) {
        return jsonError(
          "CONFLICT",
          "请先将阶段移至回收站，再执行永久删除",
          409
        );
      }

      await prisma.testStage.delete({ where: { id } });

      await writeAuditLog({
        userId: authResult.userId,
        action: "DELETE",
        entityType: "stage",
        entityId: id,
        changes: {
          permanent: true,
          name: existing.name,
          projectId: existing.projectId,
        },
      });

      return NextResponse.json({ deleted: true, permanent: true });
    }

    if (!existing.archived) {
      await prisma.testStage.update({
        where: { id },
        data: { archived: true },
      });

      await writeAuditLog({
        userId: authResult.userId,
        action: "ARCHIVE",
        entityType: "stage",
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
      permanent ? "永久删除阶段失败" : "将阶段移至回收站失败",
      {
        request,
        error,
        event: permanent
          ? "stage.permanent_delete_failed"
          : "stage.trash_failed",
        context: { userId: authResult.userId },
      },
    );
  }
}
