import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import {
  isValidCasePriority,
  validateOptionalDate,
  validateProgressCategory,
  isValidCuid,
  validateStringMaxLength,
} from "@/lib/validations";
import { toCaseDTO } from "@/lib/serializers";
import { getProjectAccess } from "@/lib/project-access";
import { writeAuditLog } from "@/lib/audit";
import { notifyCaseUpdatesBestEffort } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";
import { RESULT_SUMMARIES } from "@/types";
import type {
  CasesResponse,
  BatchUpdateCaseRequest,
  BatchUpdateResponse,
  ResultSummary,
} from "@/types";

const SORTABLE_FIELDS = [
  "caseNo",
  "name",
  "resultSummary",
  "assignee",
  "progressCategory",
  "assetSaved",
  "createdAt",
  "updatedAt",
] as const;

type SortableField = (typeof SORTABLE_FIELDS)[number];

export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const testStageId = searchParams.get("testStageId") || undefined;
    const batchScopeId = searchParams.get("batchScopeId") || undefined;
    const progressCategory = searchParams.get("progressCategory") || undefined;
    const assetSavedStr = searchParams.get("assetSaved") || undefined;
    const search = searchParams.get("search") || undefined;
    const resultSummary = searchParams.get("resultSummary") || undefined;
    const assignee = searchParams.get("assignee") || undefined;
    const rootCause = searchParams.get("rootCause") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const sortField = searchParams.get("sortField") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

    if (!SORTABLE_FIELDS.includes(sortField as SortableField)) {
      return jsonError("VALIDATION_ERROR", "排序字段不合法");
    }
    if (sortOrder !== "asc" && sortOrder !== "desc") {
      return jsonError("VALIDATION_ERROR", "排序方向不合法");
    }

    if (resultSummary && !RESULT_SUMMARIES.includes(resultSummary as ResultSummary)) {
      return jsonError("VALIDATION_ERROR", "结果概要筛选值不合法");
    }

    const user = await prisma.user.findUnique({
      where: { id: authResult.userId },
      select: { role: true },
    });
    if (!user) return jsonError("UNAUTHORIZED", "用户不存在", 401);

    let resolvedProjectId = projectId;
    if (testStageId) {
      const stage = await prisma.testStage.findUnique({
        where: { id: testStageId },
        select: { projectId: true },
      });
      if (!stage) return jsonError("NOT_FOUND", "阶段不存在", 404);
      if (resolvedProjectId && resolvedProjectId !== stage.projectId) {
        return jsonError("VALIDATION_ERROR", "阶段与项目不匹配");
      }
      resolvedProjectId = stage.projectId;
    }
    if (batchScopeId) {
      const batch = await prisma.batchScope.findUnique({
        where: { id: batchScopeId },
        select: { projectId: true, testStageId: true },
      });
      if (!batch) return jsonError("NOT_FOUND", "批跑不存在", 404);
      if (
        (resolvedProjectId && resolvedProjectId !== batch.projectId) ||
        (testStageId && testStageId !== batch.testStageId)
      ) {
        return jsonError("VALIDATION_ERROR", "批跑与项目或阶段不匹配");
      }
      resolvedProjectId = batch.projectId;
    }
    if (resolvedProjectId) {
      const access = await getProjectAccess(prisma, authResult.userId, resolvedProjectId);
      if (!access?.canView) return jsonError("FORBIDDEN", "无权访问该项目", 403);
    }

    const where: Prisma.CaseResultWhereInput = {};
    if (projectId) where.projectId = projectId;
    if (!resolvedProjectId && user.role !== "ADMIN") {
      where.project = { members: { some: { userId: authResult.userId } } };
    }
    if (testStageId) where.testStageId = testStageId;
    if (batchScopeId) where.batchScopeId = batchScopeId;
    if (progressCategory) where.progressCategory = progressCategory;
    if (assetSavedStr !== undefined) where.assetSaved = assetSavedStr === "true";
    if (resultSummary) where.resultSummary = resultSummary;
    if (assignee) where.assignee = { contains: assignee };
    if (rootCause) where.rootCause = { contains: rootCause };
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
      where.createdAt = createdAt;
    }
    if (search) {
      where.OR = [
        { caseNo: { contains: search } },
        { name: { contains: search } },
      ];
    }

    const orderBy: Record<string, "asc" | "desc"> = { [sortField]: sortOrder };

    const [cases, total] = await Promise.all([
      prisma.caseResult.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          project: { select: { name: true } },
          stage: { select: { name: true } },
        },
      }),
      prisma.caseResult.count({ where }),
    ]);

    return NextResponse.json<CasesResponse>({
      cases: cases.map(toCaseDTO),
      total,
      page,
      pageSize,
    });
  } catch {
    return internalError("获取用例列表失败");
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body: BatchUpdateCaseRequest = await request.json();
    const { caseIds, updates } = body;

    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return jsonError("VALIDATION_ERROR", "请提供要更新的用例ID列表");
    }

    if (!updates || Object.keys(updates).length === 0) {
      return jsonError("VALIDATION_ERROR", "请提供要更新的字段");
    }

    // 校验 caseIds CUID 格式
    for (const id of caseIds) {
      if (!isValidCuid(id)) {
        return jsonError("VALIDATION_ERROR", "用例ID格式不合法");
      }
    }

    const uniqueCaseIds = Array.from(new Set(caseIds));
    const existingCases = await prisma.caseResult.findMany({
      where: { id: { in: uniqueCaseIds } },
    });
    if (existingCases.length === 0) {
      return NextResponse.json<BatchUpdateResponse>({ updated: 0 });
    }
    const projectIds = Array.from(new Set(existingCases.map((item) => item.projectId)));
    for (const projectId of projectIds) {
      const access = await getProjectAccess(prisma, authResult.userId, projectId);
      if (!access?.canEdit) {
        return jsonError("FORBIDDEN", "无权编辑所选用例中的项目", 403);
      }
    }

    const data: Record<string, unknown> = {};
    if (updates.assignee !== undefined) data.assignee = updates.assignee;
    if (updates.assigneeId !== undefined) {
      if (updates.assigneeId === null || updates.assigneeId === "") {
        data.assigneeId = null;
        data.assignee = null;
      } else if (typeof updates.assigneeId !== "string") {
        return jsonError("VALIDATION_ERROR", "责任人不合法");
      } else {
        const memberships = await prisma.projectMember.findMany({
          where: {
            userId: updates.assigneeId,
            projectId: { in: projectIds },
          },
          include: { user: { select: { username: true } } },
        });
        if (memberships.length !== projectIds.length) {
          return jsonError("VALIDATION_ERROR", "责任人必须是所有所选用例的项目成员");
        }
        data.assigneeId = updates.assigneeId;
        data.assignee = memberships[0].user.username;
      }
    }
    if (updates.priority !== undefined) {
      if (updates.priority !== null && !isValidCasePriority(updates.priority)) {
        return jsonError("VALIDATION_ERROR", "优先级不合法");
      }
      data.priority = updates.priority;
    }
    if (updates.dueDate !== undefined) {
      const error = validateOptionalDate(updates.dueDate, "截止日期");
      if (error) return jsonError("VALIDATION_ERROR", error);
      data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    }
    if (updates.progressCategory !== undefined) {
      if (updates.progressCategory === null) {
        data.progressCategory = null;
      } else {
        const valid = validateProgressCategory(updates.progressCategory);
        if (!valid) {
          return jsonError("VALIDATION_ERROR", "进展分类不合法");
        }
        data.progressCategory = valid;
      }
    }
    if (updates.rootCause !== undefined) {
      const err = validateStringMaxLength(updates.rootCause, 200, "根因");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.rootCause = updates.rootCause;
    }
    if (updates.rootCauseCategoryId !== undefined) {
      if (
        updates.rootCauseCategoryId === null ||
        updates.rootCauseCategoryId === ""
      ) {
        data.rootCauseCategoryId = null;
      } else if (typeof updates.rootCauseCategoryId !== "string") {
        return jsonError("VALIDATION_ERROR", "根因分类不合法");
      } else {
        const category = await prisma.rootCauseCategory.findUnique({
          where: { id: updates.rootCauseCategoryId },
        });
        if (
          !category ||
          category.archived ||
          (category.projectId !== null &&
            (projectIds.length !== 1 || category.projectId !== projectIds[0]))
        ) {
          return jsonError("VALIDATION_ERROR", "根因分类不属于所选项目或已归档");
        }
        data.rootCauseCategoryId = category.id;
      }
    }
    if (updates.mrOrTicket !== undefined) {
      const err = validateStringMaxLength(updates.mrOrTicket, 200, "MR/单号");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.mrOrTicket = updates.mrOrTicket;
    }
    if (updates.assetSaved !== undefined) data.assetSaved = updates.assetSaved;
    if (updates.notes !== undefined) {
      const err = validateStringMaxLength(updates.notes, 5000, "备注");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.notes = updates.notes;
    }
    data.updatedBy = authResult.userId;

    const trackedFields = [
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
    const changesByCase = existingCases.map((existing) => {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const field of trackedFields) {
        if (data[field] === undefined) continue;
        const from = existing[field] instanceof Date
          ? existing[field].toISOString()
          : existing[field];
        const to = data[field] instanceof Date
          ? data[field].toISOString()
          : data[field];
        if (from !== to) changes[field] = { from: from ?? null, to: to ?? null };
      }
      return { id: existing.id, changes };
    });

    const runUpdate = async (
      tx: Pick<typeof prisma, "caseResult" | "caseActivity" | "auditLog">
    ) => {
      const result = await tx.caseResult.updateMany({
        where: { id: { in: existingCases.map((item) => item.id) } },
        data,
      });
      for (const item of changesByCase) {
        if (Object.keys(item.changes).length > 0) {
          await tx.caseActivity.create({
            data: {
              caseResultId: item.id,
              userId: authResult.userId,
              type: "UPDATED",
              changes: item.changes as Prisma.InputJsonValue,
            },
          });
        }
        await writeAuditLog({
          userId: authResult.userId,
          action: "UPDATE",
          entityType: "case",
          entityId: item.id,
          changes: item.changes,
        }, tx);
      }
      return result;
    };
    const result =
      typeof prisma.$transaction === "function"
        ? await prisma.$transaction((tx) => runUpdate(tx))
        : await runUpdate(prisma);
    await notifyCaseUpdatesBestEffort({
      actorId: authResult.userId,
      updates: existingCases.map((existing) => {
        const changes =
          changesByCase.find((item) => item.id === existing.id)?.changes ?? {};
        return {
          caseResultId: existing.id,
          projectId: existing.projectId,
          assigneeId:
            "assigneeId" in data
              ? (data.assigneeId as string | null)
              : existing.assigneeId,
          assigneeChanged: "assigneeId" in changes,
          watchedChanged: [
            "assigneeId",
            "priority",
            "dueDate",
            "progressCategory",
          ].some((field) => field in changes),
        };
      }),
    });

    return NextResponse.json<BatchUpdateResponse>({ updated: result.count });
  } catch {
    return internalError("批量更新用例失败");
  }
}
