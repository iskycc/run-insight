import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import {
  isValidCasePriority,
  isValidCuid,
  validateLogUrl,
  validateOptionalDate,
  validateProgressCategory,
  validateRequired,
  validateStringMaxLength,
} from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { toCaseDTO } from "@/lib/serializers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { notifyCaseUpdatesBestEffort } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";
import { RESULT_SUMMARIES } from "@/types";
import type {
  CaseDetailResponse,
  UpdateCaseRequest,
} from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    if (!isValidCuid(id)) {
      return jsonError("VALIDATION_ERROR", "无效的用例ID");
    }

    const caseResult = await prisma.caseResult.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
        batchScope: { select: { id: true, name: true } },
        updater: { select: { username: true } },
        rootCauseCategory: { select: { id: true, name: true } },
      },
    });
    if (!caseResult) {
      return jsonError("NOT_FOUND", "用例不存在", 404);
    }
    const access = await getProjectAccess(prisma, authResult.userId, caseResult.projectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权查看该项目的用例", 403);

    const { project, stage, batchScope, updater, ...caseFields } = caseResult;

    return NextResponse.json({
      case: {
        ...toCaseDTO(caseFields),
        updatedByUsername: updater?.username ?? null,
        project,
        stage,
        batchScope,
      },
    });
  } catch {
    return internalError("获取用例详情失败");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    if (!isValidCuid(id)) {
      return jsonError("VALIDATION_ERROR", "无效的用例ID");
    }

    const existing = await prisma.caseResult.findUnique({ where: { id } });
    if (!existing) {
      return jsonError("NOT_FOUND", "用例不存在", 404);
    }
    const access = await getProjectAccess(prisma, authResult.userId, existing.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权编辑该项目的用例", 403);

    const body: UpdateCaseRequest = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const required = validateRequired(name, "用例名称");
      if (required) return jsonError("VALIDATION_ERROR", required);
      const error = validateStringMaxLength(name, 191, "用例名称");
      if (error) return jsonError("VALIDATION_ERROR", error);
      data.name = name;
    }
    if (body.resultSummary !== undefined) {
      if (!RESULT_SUMMARIES.includes(body.resultSummary)) {
        return jsonError("VALIDATION_ERROR", "结果概要必须为 PASS/FAIL/BLOCK/SKIP 之一");
      }
      data.resultSummary = body.resultSummary;
    }
    if (body.logUrl !== undefined) {
      if (body.logUrl !== null && typeof body.logUrl !== "string") {
        return jsonError("VALIDATION_ERROR", "日志链接格式不正确");
      }
      const logUrl = body.logUrl?.trim() ?? null;
      const error = validateLogUrl(logUrl || undefined);
      if (error) return jsonError("VALIDATION_ERROR", error);
      data.logUrl = logUrl || null;
    }
    if (body.assignee !== undefined) {
      if (typeof body.assignee !== "string") {
        return jsonError("VALIDATION_ERROR", "责任人格式不正确");
      }
      data.assignee = body.assignee.trim() || null;
    }
    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null || body.assigneeId === "") {
        data.assigneeId = null;
        data.assignee = null;
      } else if (typeof body.assigneeId !== "string") {
        return jsonError("VALIDATION_ERROR", "责任人不合法");
      } else {
        const member = await prisma.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId: existing.projectId,
              userId: body.assigneeId,
            },
          },
          include: { user: { select: { username: true } } },
        });
        if (!member) return jsonError("VALIDATION_ERROR", "责任人必须是项目成员");
        data.assigneeId = body.assigneeId;
        data.assignee = member.user.username;
      }
    }
    if (body.priority !== undefined) {
      if (body.priority !== null && !isValidCasePriority(body.priority)) {
        return jsonError("VALIDATION_ERROR", "优先级不合法");
      }
      data.priority = body.priority;
    }
    if (body.dueDate !== undefined) {
      const error = validateOptionalDate(body.dueDate, "截止日期");
      if (error) return jsonError("VALIDATION_ERROR", error);
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.progressCategory !== undefined) {
      if (body.progressCategory === null) {
        data.progressCategory = null;
      } else {
        const valid = validateProgressCategory(body.progressCategory);
        if (!valid) {
          return jsonError("VALIDATION_ERROR", "进展分类不合法");
        }
        data.progressCategory = valid;
      }
    }
    if (body.rootCause !== undefined) {
      const err = validateStringMaxLength(body.rootCause, 200, "根因");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.rootCause = body.rootCause;
    }
    if (body.rootCauseCategoryId !== undefined) {
      if (body.rootCauseCategoryId === null || body.rootCauseCategoryId === "") {
        data.rootCauseCategoryId = null;
      } else if (typeof body.rootCauseCategoryId !== "string") {
        return jsonError("VALIDATION_ERROR", "根因分类不合法");
      } else {
        const category = await prisma.rootCauseCategory.findUnique({
          where: { id: body.rootCauseCategoryId },
        });
        if (
          !category ||
          category.archived ||
          (category.projectId !== null && category.projectId !== existing.projectId)
        ) {
          return jsonError("VALIDATION_ERROR", "根因分类不属于该项目或已归档");
        }
        data.rootCauseCategoryId = category.id;
      }
    }
    if (body.mrOrTicket !== undefined) {
      const err = validateStringMaxLength(body.mrOrTicket, 200, "MR/单号");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.mrOrTicket = body.mrOrTicket;
    }
    if (body.assetSaved !== undefined) data.assetSaved = body.assetSaved;
    if (body.notes !== undefined) {
      const err = validateStringMaxLength(body.notes, 5000, "备注");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.notes = body.notes;
    }
    data.updatedBy = authResult.userId;

    const trackedFields = [
      "name",
      "resultSummary",
      "logUrl",
      "assignee",
      "assigneeId",
      "priority",
      "dueDate",
      "progressCategory",
      "rootCause",
      "rootCauseCategoryId",
      "mrOrTicket",
      "notes",
      "assetSaved",
    ] as const;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of trackedFields) {
      if (data[field] !== undefined) {
        const from = existing[field] instanceof Date ? existing[field].toISOString() : existing[field];
        const to = data[field] instanceof Date ? data[field].toISOString() : data[field];
        if (from !== to) changes[field] = { from: from ?? null, to: to ?? null };
      }
    }

    const performUpdate = async (
      tx: Pick<typeof prisma, "caseResult" | "caseActivity">
    ) => {
      const result = await tx.caseResult.update({
        where: { id },
        data,
        include: { assigneeUser: { select: { username: true } } },
      });
      if (Object.keys(changes).length > 0 && tx.caseActivity?.create) {
        await tx.caseActivity.create({
          data: {
            caseResultId: id,
            userId: authResult.userId,
            type: "UPDATED",
            changes: changes as Prisma.InputJsonValue,
          },
        });
      }
      return result;
    };
    const updated =
      typeof prisma.$transaction === "function"
        ? await prisma.$transaction((tx) => performUpdate(tx))
        : await performUpdate(prisma);

    await writeAuditLog({
      userId: authResult.userId,
      action: "UPDATE",
      entityType: "case",
      entityId: id,
      changes: body,
    });
    await notifyCaseUpdatesBestEffort({
      actorId: authResult.userId,
      updates: [
        {
          caseResultId: id,
          projectId: existing.projectId,
          assigneeId: updated.assigneeId,
          assigneeChanged: "assigneeId" in changes,
          watchedChanged: [
            "assigneeId",
            "priority",
            "dueDate",
            "progressCategory",
          ].some((field) => field in changes),
        },
      ],
    });

    return NextResponse.json<CaseDetailResponse>({
      case: {
        ...toCaseDTO(updated),
        updatedByUsername: authResult.username,
      },
    });
  } catch {
    return internalError("更新用例失败");
  }
}
