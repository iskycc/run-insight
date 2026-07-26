import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
} from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import {
  savedViewFiltersToJson,
  serializeSavedView,
  validateSavedViewFilters,
  validateSavedViewName,
} from "@/lib/saved-views";
import type { SavedViewFilters, SavedViewResponse } from "@/types";

async function canManageView(
  userId: string,
  view: { ownerId: string; scope: "PERSONAL" | "PROJECT"; projectId: string | null },
) {
  if (view.scope === "PERSONAL") return view.ownerId === userId;
  if (!view.projectId) return false;
  const access = await getProjectAccess(prisma, userId, view.projectId);
  return (
    access?.canAdmin === true ||
    (view.ownerId === userId && access?.canEdit === true)
  );
}

async function validateFilterReferences(
  userId: string,
  filters: SavedViewFilters,
): Promise<NextResponse | null> {
  if (!filters.projectId) return null;
  const project = await prisma.project.findUnique({
    where: { id: filters.projectId },
    select: { id: true, archived: true },
  });
  if (!project) {
    return jsonError("VALIDATION_ERROR", "筛选项目不存在");
  }
  if (project.archived) {
    return jsonError("CONFLICT", "不能保存已归档项目的筛选条件", 409);
  }
  const access = await getProjectAccess(prisma, userId, filters.projectId);
  if (!access?.canView) {
    return jsonError("FORBIDDEN", "无权保存该项目的筛选条件", 403);
  }
  if (filters.stageId) {
    const stage = await prisma.testStage.findUnique({
      where: { id: filters.stageId },
      select: { projectId: true, archived: true },
    });
    if (!stage || stage.projectId !== filters.projectId) {
      return jsonError("VALIDATION_ERROR", "测试阶段与项目不匹配");
    }
    if (stage.archived) {
      return jsonError("CONFLICT", "不能保存已归档阶段的筛选条件", 409);
    }
  }
  if (filters.batchScopeId) {
    const batch = await prisma.batchScope.findUnique({
      where: { id: filters.batchScopeId },
      select: { projectId: true, testStageId: true, archived: true },
    });
    if (
      !batch ||
      batch.projectId !== filters.projectId ||
      batch.testStageId !== filters.stageId
    ) {
      return jsonError("VALIDATION_ERROR", "批跑范围与项目或阶段不匹配");
    }
    if (batch.archived) {
      return jsonError("CONFLICT", "不能保存已归档批跑的筛选条件", 409);
    }
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "保存视图不存在", 404);
    if (!(await canManageView(auth.userId, existing))) {
      return jsonError("FORBIDDEN", "无权管理该保存视图", 403);
    }
    if (existing.scope === "PROJECT" && existing.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: existing.projectId },
        select: { archived: true },
      });
      if (project?.archived) {
        return jsonError("CONFLICT", "已归档项目的共享视图不能修改", 409);
      }
    }

    const parsedBody = await parseJsonObject(request, [
      "name",
      "filters",
      "isDefault",
    ]);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const data: {
      name?: string;
      filters?: Record<string, string>;
      isDefault?: boolean;
    } = {};

    if (body.name !== undefined) {
      const name = validateSavedViewName(body.name);
      if (!name) {
        return jsonError(
          "VALIDATION_ERROR",
          "视图名称不能为空且长度不能超过100个字符",
        );
      }
      const duplicate = await prisma.savedView.findFirst({
        where: {
          ...(existing.scope === "PROJECT"
            ? { scope: existing.scope, projectId: existing.projectId }
            : { scope: existing.scope, ownerId: auth.userId }),
          name,
          NOT: { id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return jsonError("CONFLICT", "同一范围内已存在同名视图", 409);
      }
      data.name = name;
    }

    if (body.filters !== undefined) {
      const filterResult = validateSavedViewFilters(body.filters);
      if (!filterResult.ok) {
        return jsonError("VALIDATION_ERROR", filterResult.error);
      }
      if (
        existing.scope === "PROJECT" &&
        filterResult.filters.projectId !== existing.projectId
      ) {
        return jsonError(
          "VALIDATION_ERROR",
          "项目共享视图的筛选项目必须与共享项目一致",
        );
      }
      const referenceError = await validateFilterReferences(
        auth.userId,
        filterResult.filters,
      );
      if (referenceError) return referenceError;
      data.filters = savedViewFiltersToJson(filterResult.filters);
    }

    if (body.isDefault !== undefined) {
      if (typeof body.isDefault !== "boolean") {
        return jsonError("VALIDATION_ERROR", "默认视图状态不合法");
      }
      data.isDefault = body.isDefault;
    }
    if (Object.keys(data).length === 0) {
      return jsonError("VALIDATION_ERROR", "没有可更新的字段");
    }

    const view = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.savedView.updateMany({
          where: {
            ownerId: auth.userId,
            scope: existing.scope,
            projectId: existing.projectId,
            NOT: { id },
          },
          data: { isDefault: false },
        });
      }
      return tx.savedView.update({
        where: { id },
        data,
        include: { owner: { select: { username: true } } },
      });
    });

    return NextResponse.json<SavedViewResponse>({
      view: serializeSavedView(view, auth.userId, true, auth.username),
    });
  } catch (error) {
    return internalError("更新保存视图失败", {
      request,
      error,
      event: "saved_view.update_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "保存视图不存在", 404);
    if (!(await canManageView(auth.userId, existing))) {
      return jsonError("FORBIDDEN", "无权管理该保存视图", 403);
    }
    await prisma.savedView.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return internalError("删除保存视图失败", {
      request,
      error,
      event: "saved_view.delete_failed",
      context: { userId: auth.userId },
    });
  }
}
