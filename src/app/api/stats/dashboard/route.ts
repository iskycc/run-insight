import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-helpers";
import type { DashboardStatsResponse } from "@/types";
import { PROGRESS_LABELS, RESULT_SUMMARIES } from "@/types";
import type { ProgressCategory } from "@/types";

function percentage(part: number, total: number) {
  if (total === 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const testStageId = searchParams.get("testStageId") || undefined;
    const batchScopeId = searchParams.get("batchScopeId") || undefined;
    const progressCategory = searchParams.get("progressCategory") || undefined;
    const assetSaved = searchParams.get("assetSaved") || undefined;
    const search = searchParams.get("search") || undefined;
    const resultSummary = searchParams.get("resultSummary") || undefined;
    const assignee = searchParams.get("assignee") || undefined;
    const rootCause = searchParams.get("rootCause") || undefined;
    const startDate =
      searchParams.get("dateFrom") || searchParams.get("startDate") || undefined;
    const endDate =
      searchParams.get("dateTo") || searchParams.get("endDate") || undefined;

    const where: Record<string, unknown> = {};
    if (projectId) where.projectId = projectId;
    if (testStageId) where.testStageId = testStageId;
    if (batchScopeId) where.batchScopeId = batchScopeId;
    if (progressCategory) where.progressCategory = progressCategory;
    if (assetSaved !== undefined) where.assetSaved = assetSaved === "true";
    if (resultSummary && RESULT_SUMMARIES.includes(resultSummary as (typeof RESULT_SUMMARIES)[number])) {
      where.resultSummary = resultSummary;
    }
    if (assignee) where.assignee = { contains: assignee };
    if (rootCause) where.rootCause = { contains: rootCause };
    if (search) {
      where.OR = [
        { caseNo: { contains: search } },
        { name: { contains: search } },
      ];
    }

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) {
      dateFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
    }
    if (Object.keys(dateFilter).length > 0) {
      where.createdAt = dateFilter;
    }

    // Build where clauses for project/testStage/batchScope counts
    // Prisma count() types are strict — use conditional calls instead of ternary args
    const projectCount = projectId
      ? await prisma.project.count({ where: { id: projectId } })
      : await prisma.project.count();

    const testStageCount = testStageId
      ? await prisma.testStage.count({ where: { id: testStageId } })
      : projectId
        ? await prisma.testStage.count({ where: { projectId } })
        : await prisma.testStage.count();

    const batchScopeCount = batchScopeId
      ? await prisma.batchScope.count({ where: { id: batchScopeId } })
      : testStageId
        ? await prisma.batchScope.count({ where: { testStageId } })
        : projectId
          ? await prisma.batchScope.count({ where: { projectId } })
          : await prisma.batchScope.count();

    const withConstraint = (field: string, value: unknown) => {
      if (!(field in where)) return { ...where, [field]: value };
      return { ...where, AND: [{ [field]: value }] };
    };

    const [
      totalCaseCount,
      passedCaseCount,
      failedCaseCount,
      blockedCaseCount,
      skippedCaseCount,
      analyzedCaseCount,
      assetCount,
      progressGrouped,
    ] = await Promise.all([
      prisma.caseResult.count({ where }),
      prisma.caseResult.count({ where: withConstraint("resultSummary", "PASS") }),
      prisma.caseResult.count({ where: withConstraint("resultSummary", "FAIL") }),
      prisma.caseResult.count({ where: withConstraint("resultSummary", "BLOCK") }),
      prisma.caseResult.count({ where: withConstraint("resultSummary", "SKIP") }),
      prisma.caseResult.count({
        where: withConstraint("progressCategory", {
          in: ["LOCATED", "FIXED", "NOT_ISSUE"],
        }),
      }),
      prisma.caseResult.count({ where: withConstraint("assetSaved", true) }),
      prisma.caseResult.groupBy({
        by: ["progressCategory"],
        _count: { _all: true },
        where: withConstraint("progressCategory", { not: null }),
      }),
    ]);

    const progressDistribution = (Object.keys(PROGRESS_LABELS) as ProgressCategory[])
      .map((cat) => ({
        category: PROGRESS_LABELS[cat],
        count:
          progressGrouped.find((g) => g.progressCategory === cat)?._count._all ?? 0,
      }))
      .filter((d) => d.count > 0);

    const passRate = percentage(passedCaseCount, totalCaseCount);
    const failRate = percentage(failedCaseCount, totalCaseCount);

    return NextResponse.json<DashboardStatsResponse>({
      projectCount,
      testStageCount,
      batchScopeCount,
      totalCaseCount,
      passedCaseCount,
      failedCaseCount,
      blockedCaseCount,
      skippedCaseCount,
      passRate,
      failRate,
      analyzedCaseCount,
      assetCount,
      progressDistribution,
    });
  } catch {
    return internalError("获取大盘统计失败");
  }
}
