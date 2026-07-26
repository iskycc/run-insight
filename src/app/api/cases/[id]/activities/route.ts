import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
} from "@/lib/api-helpers";
import { getProjectAccess } from "@/lib/project-access";
import { isValidCuid, validateStringMaxLength } from "@/lib/validations";
import { notifyCommentBestEffort } from "@/lib/notifications";
import type { CaseActivityDTO } from "@/types";

async function getCaseAndAccess(caseId: string, userId: string) {
  const caseResult = await prisma.caseResult.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      projectId: true,
      project: { select: { archived: true } },
      stage: { select: { archived: true } },
      batchScope: { select: { archived: true } },
    },
  });
  if (!caseResult) return { caseResult: null, access: null };
  const access = await getProjectAccess(prisma, userId, caseResult.projectId);
  return { caseResult, access };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (!isValidCuid(id)) return jsonError("VALIDATION_ERROR", "无效的用例ID");
    const { caseResult, access } = await getCaseAndAccess(id, auth.userId);
    if (!caseResult) return jsonError("NOT_FOUND", "用例不存在", 404);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权查看该项目", 403);

    const activities = await prisma.caseActivity.findMany({
      where: { caseResultId: id },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const result: CaseActivityDTO[] = activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      changes: activity.changes as CaseActivityDTO["changes"],
      comment: activity.comment,
      user: activity.user,
      createdAt: activity.createdAt.toISOString(),
      canManage:
        activity.type === "COMMENT" &&
        (activity.user.id === auth.userId || access.canAdmin),
    }));
    const archived =
      caseResult.project?.archived ||
      caseResult.stage?.archived ||
      caseResult.batchScope?.archived;
    return NextResponse.json({
      activities: result,
      canComment: access.canEdit && !archived,
    });
  } catch (error) {
    return internalError("获取用例动态失败", {
      request,
      error,
      event: "case_activity.list_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (!isValidCuid(id)) return jsonError("VALIDATION_ERROR", "无效的用例ID");
    const { caseResult, access } = await getCaseAndAccess(id, auth.userId);
    if (!caseResult) return jsonError("NOT_FOUND", "用例不存在", 404);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权评论该项目的用例", 403);
    if (
      caseResult.project?.archived ||
      caseResult.stage?.archived ||
      caseResult.batchScope?.archived
    ) {
      return jsonError("CONFLICT", "不能评论已归档项目、阶段或批跑中的用例", 409);
    }

    const parsedBody = await parseJsonObject(request, ["comment"]);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    if (typeof body.comment !== "string" || !body.comment.trim()) {
      return jsonError("VALIDATION_ERROR", "评论内容不能为空");
    }
    const comment = body.comment.trim();
    const error = validateStringMaxLength(comment, 5000, "评论");
    if (error) return jsonError("VALIDATION_ERROR", error);

    const activity = await prisma.caseActivity.create({
      data: {
        caseResultId: id,
        userId: auth.userId,
        type: "COMMENT",
        comment,
      },
      include: { user: { select: { id: true, username: true } } },
    });
    await notifyCommentBestEffort({
      actorId: auth.userId,
      caseResultId: id,
      projectId: caseResult.projectId,
      comment,
    });
    return NextResponse.json(
      {
        activity: {
          id: activity.id,
          type: activity.type,
          changes: null,
          comment: activity.comment,
          user: activity.user,
          createdAt: activity.createdAt.toISOString(),
          canManage: true,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return internalError("发表评论失败", {
      request,
      error,
      event: "case_activity.comment_failed",
      context: { userId: auth.userId },
    });
  }
}
