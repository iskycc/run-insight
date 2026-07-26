import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
  parseRequestUrl,
} from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, type ProjectAccess } from "@/lib/project-access";
import {
  isSavedViewScope,
  savedViewFiltersToJson,
  serializeSavedView,
  validateSavedViewFilters,
  validateSavedViewName,
} from "@/lib/saved-views";
import type {
  SavedViewFilters,
  SavedViewResponse,
  SavedViewsResponse,
} from "@/types";

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

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsedUrl = parseRequestUrl(request);
    if (!parsedUrl.ok) return parsedUrl.response;
    const projectId = parsedUrl.value.searchParams.get("projectId");
    let projectAccess: ProjectAccess | null = null;
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, archived: true },
      });
      if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
      projectAccess = await getProjectAccess(prisma, auth.userId, projectId);
      if (!projectAccess?.canView) {
        return jsonError("FORBIDDEN", "无权查看该项目的共享视图", 403);
      }
    }

    const views = await prisma.savedView.findMany({
      where: {
        OR: [
          { ownerId: auth.userId, scope: "PERSONAL" },
          ...(projectId ? [{ projectId, scope: "PROJECT" as const }] : []),
        ],
      },
      include: { owner: { select: { username: true } } },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json<SavedViewsResponse>({
      views: views.map((view) =>
        serializeSavedView(
          view,
          auth.userId,
          view.scope === "PERSONAL"
            ? view.ownerId === auth.userId
            : projectAccess?.canAdmin === true ||
                (view.ownerId === auth.userId && projectAccess?.canEdit === true),
        ),
      ),
      canShare: projectAccess?.canEdit === true,
    });
  } catch (error) {
    return internalError("获取保存视图失败", {
      request,
      error,
      event: "saved_view.list_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsedBody = await parseJsonObject(request, [
      "name",
      "filters",
      "scope",
      "projectId",
      "isDefault",
    ]);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const name = validateSavedViewName(body.name);
    if (!name) {
      return jsonError(
        "VALIDATION_ERROR",
        "视图名称不能为空且长度不能超过100个字符",
      );
    }

    const filterResult = validateSavedViewFilters(body.filters);
    if (!filterResult.ok) {
      return jsonError("VALIDATION_ERROR", filterResult.error);
    }
    const filters = filterResult.filters;

    const scope = body.scope ?? "PERSONAL";
    if (!isSavedViewScope(scope)) {
      return jsonError("VALIDATION_ERROR", "视图范围不合法");
    }
    if (body.isDefault !== undefined && typeof body.isDefault !== "boolean") {
      return jsonError("VALIDATION_ERROR", "默认视图状态不合法");
    }

    let projectId: string | null = null;
    let projectAccess: ProjectAccess | null = null;
    if (scope === "PROJECT") {
      if (typeof body.projectId !== "string" || !body.projectId) {
        return jsonError("VALIDATION_ERROR", "项目共享视图必须指定项目");
      }
      projectId = body.projectId;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
      projectAccess = await getProjectAccess(prisma, auth.userId, projectId);
      if (!projectAccess?.canEdit) {
        return jsonError("FORBIDDEN", "无权在该项目创建共享视图", 403);
      }
      if (filters.projectId !== projectId) {
        return jsonError(
          "VALIDATION_ERROR",
          "项目共享视图的筛选项目必须与共享项目一致",
        );
      }
    } else if (body.projectId !== undefined && body.projectId !== null) {
      return jsonError("VALIDATION_ERROR", "个人视图不能指定共享项目");
    }

    const referenceError = await validateFilterReferences(auth.userId, filters);
    if (referenceError) return referenceError;

    const duplicate = await prisma.savedView.findFirst({
      where:
        scope === "PROJECT"
          ? { scope, projectId, name }
          : { scope, ownerId: auth.userId, name },
      select: { id: true },
    });
    if (duplicate) {
      return jsonError("CONFLICT", "同一范围内已存在同名视图", 409);
    }

    const isDefault = body.isDefault === true;
    const view = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.savedView.updateMany({
          where: { ownerId: auth.userId, scope, projectId },
          data: { isDefault: false },
        });
      }
      return tx.savedView.create({
        data: {
          ownerId: auth.userId,
          projectId,
          name,
          filters: savedViewFiltersToJson(filters),
          scope,
          isDefault,
        },
        include: { owner: { select: { username: true } } },
      });
    });

    return NextResponse.json<SavedViewResponse>(
      { view: serializeSavedView(view, auth.userId, true, auth.username) },
      { status: 201 },
    );
  } catch (error) {
    return internalError("创建保存视图失败", {
      request,
      error,
      event: "saved_view.create_failed",
      context: { userId: auth.userId },
    });
  }
}
