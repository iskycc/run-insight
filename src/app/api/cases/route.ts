import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { validateProgressCategory, isValidCuid, validateStringMaxLength } from "@/lib/validations";
import { toCaseDTO } from "@/lib/serializers";
import { writeAuditLog } from "@/lib/audit";
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
  const authResult = authenticateRequest(request);
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

    const where: Record<string, unknown> = {};
    if (projectId) where.projectId = projectId;
    if (testStageId) where.testStageId = testStageId;
    if (batchScopeId) where.batchScopeId = batchScopeId;
    if (progressCategory) where.progressCategory = progressCategory;
    if (assetSavedStr !== undefined) where.assetSaved = assetSavedStr === "true";
    if (resultSummary) where.resultSummary = resultSummary;
    if (assignee) where.assignee = { contains: assignee };
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
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN", "EDITOR"], prisma);
  if (roleCheck) return roleCheck;

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

    const data: Record<string, unknown> = {};
    if (updates.assignee !== undefined) data.assignee = updates.assignee;
    if (updates.progressCategory !== undefined) {
      const valid = validateProgressCategory(updates.progressCategory);
      if (!valid) {
        return jsonError("VALIDATION_ERROR", "进展分类不合法");
      }
      data.progressCategory = updates.progressCategory;
    }
    if (updates.rootCause !== undefined) {
      const err = validateStringMaxLength(updates.rootCause, 200, "根因");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.rootCause = updates.rootCause;
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

    const result = await prisma.caseResult.updateMany({
      where: { id: { in: caseIds } },
      data,
    });

    // Write audit logs for each updated case
    for (const id of caseIds) {
      await writeAuditLog({
        userId: authResult.userId,
        action: "UPDATE",
        entityType: "case",
        entityId: id,
        changes: updates,
      });
    }

    return NextResponse.json<BatchUpdateResponse>({ updated: result.count });
  } catch {
    return internalError("批量更新用例失败");
  }
}
