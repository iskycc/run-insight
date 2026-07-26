import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { isValidCuid, validateStringMaxLength } from "@/lib/validations";

type RouteContext = {
  params: Promise<{ id: string; activityId: string }>;
};

async function getCommentAccess(
  caseId: string,
  activityId: string,
  userId: string,
) {
  const activity = await prisma.caseActivity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      caseResultId: true,
      userId: true,
      type: true,
      comment: true,
      createdAt: true,
      user: { select: { id: true, username: true } },
      caseResult: {
        select: {
          projectId: true,
          project: { select: { archived: true } },
          stage: { select: { archived: true } },
          batchScope: { select: { archived: true } },
        },
      },
    },
  });

  if (!activity || activity.caseResultId !== caseId) {
    return { activity: null, access: null };
  }

  const access = await getProjectAccess(
    prisma,
    userId,
    activity.caseResult.projectId,
  );
  return { activity, access };
}

function belongsToArchivedResource(activity: {
  caseResult: {
    project?: { archived: boolean };
    stage?: { archived: boolean };
    batchScope?: { archived: boolean };
  };
}) {
  return (
    activity.caseResult.project?.archived === true ||
    activity.caseResult.stage?.archived === true ||
    activity.caseResult.batchScope?.archived === true
  );
}

function validateComment(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false as const, message: "评论内容不能为空" };
  }
  const comment = value.trim();
  const error = validateStringMaxLength(comment, 5000, "评论");
  if (error) return { ok: false as const, message: error };
  return { ok: true as const, comment };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: caseId, activityId } = await params;
    if (!isValidCuid(caseId) || !isValidCuid(activityId)) {
      return jsonError("VALIDATION_ERROR", "无效的用例或动态ID");
    }

    const { activity, access } = await getCommentAccess(
      caseId,
      activityId,
      auth.userId,
    );
    if (!activity) return jsonError("NOT_FOUND", "评论不存在", 404);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权访问该项目", 403);
    if (belongsToArchivedResource(activity)) {
      return jsonError("CONFLICT", "不能编辑已归档资源中的评论", 409);
    }
    if (activity.type !== "COMMENT") {
      return jsonError("INVALID_ACTIVITY_TYPE", "仅评论支持编辑", 409);
    }
    if (activity.userId !== auth.userId && !access.canAdmin) {
      return jsonError("FORBIDDEN", "仅评论作者或项目管理员可以编辑", 403);
    }

    const parsedBody = await parseJsonObject(request, ["comment"]);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const validation = validateComment(body.comment);
    if (!validation.ok) {
      return jsonError("VALIDATION_ERROR", validation.message);
    }

    const updated = await prisma.caseActivity.update({
      where: { id: activityId },
      data: { comment: validation.comment },
      include: { user: { select: { id: true, username: true } } },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "UPDATE",
      entityType: "caseActivity",
      entityId: activityId,
      changes: {
        caseResultId: caseId,
        comment: { from: activity.comment, to: validation.comment },
      },
    });

    return NextResponse.json({
      activity: {
        id: updated.id,
        type: updated.type,
        changes: null,
        comment: updated.comment,
        user: updated.user,
        createdAt: updated.createdAt.toISOString(),
        canManage: true,
      },
    });
  } catch (error) {
    return internalError("编辑评论失败", {
      request,
      error,
      event: "case_activity.comment_update_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: caseId, activityId } = await params;
    if (!isValidCuid(caseId) || !isValidCuid(activityId)) {
      return jsonError("VALIDATION_ERROR", "无效的用例或动态ID");
    }

    const { activity, access } = await getCommentAccess(
      caseId,
      activityId,
      auth.userId,
    );
    if (!activity) return jsonError("NOT_FOUND", "评论不存在", 404);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权访问该项目", 403);
    if (belongsToArchivedResource(activity)) {
      return jsonError("CONFLICT", "不能删除已归档资源中的评论", 409);
    }
    if (activity.type !== "COMMENT") {
      return jsonError("INVALID_ACTIVITY_TYPE", "仅评论支持删除", 409);
    }
    if (activity.userId !== auth.userId && !access.canAdmin) {
      return jsonError("FORBIDDEN", "仅评论作者或项目管理员可以删除", 403);
    }

    await prisma.caseActivity.delete({ where: { id: activityId } });
    await writeAuditLog({
      userId: auth.userId,
      action: "DELETE",
      entityType: "caseActivity",
      entityId: activityId,
      changes: {
        caseResultId: caseId,
        type: "COMMENT",
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return internalError("删除评论失败", {
      request,
      error,
      event: "case_activity.comment_delete_failed",
      context: { userId: auth.userId },
    });
  }
}
