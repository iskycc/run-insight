import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { TrendResponse } from "@/types";

function percentage(part: number, total: number) {
  if (total === 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function parseLimit(value: string | null): number | null {
  if (value === null) return 10;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 30 ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    if (limit === null) {
      return jsonError("VALIDATION_ERROR", "趋势数量必须为 1 到 30 的整数");
    }
    const projectId = searchParams.get("projectId") || undefined;

    const batchWhere: Record<string, unknown> = {};
    if (projectId) batchWhere.projectId = projectId;

    const recentBatches = await prisma.batchScope.findMany({
      where: batchWhere,
      orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    if (recentBatches.length === 0) {
      return NextResponse.json<TrendResponse>({ trends: [] });
    }

    const batchIds = recentBatches.map((b) => b.id);

    const [totalCounts, passedCounts, failedCounts, blockedCounts, skippedCounts, analyzedCounts] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batchIds } },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batchIds }, resultSummary: "PASS" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batchIds }, resultSummary: "FAIL" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batchIds }, resultSummary: "BLOCK" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batchIds }, resultSummary: "SKIP" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: {
          batchScopeId: { in: batchIds },
          progressCategory: { in: ["LOCATED", "FIXED", "NOT_ISSUE"] },
        },
        _count: { _all: true },
      }),
    ]);

    const totalMap = new Map(totalCounts.map((r) => [r.batchScopeId, r._count._all]));
    const passedMap = new Map(passedCounts.map((r) => [r.batchScopeId, r._count._all]));
    const failedMap = new Map(failedCounts.map((r) => [r.batchScopeId, r._count._all]));
    const blockedMap = new Map(blockedCounts.map((r) => [r.batchScopeId, r._count._all]));
    const skippedMap = new Map(skippedCounts.map((r) => [r.batchScopeId, r._count._all]));
    const analyzedMap = new Map(analyzedCounts.map((r) => [r.batchScopeId, r._count._all]));

    // The database query selects the newest N runs. Reverse that stable
    // executedAt/createdAt order for a left-to-right chronological chart.
    const trends = [...recentBatches].reverse().map((batch) => {
      const total = totalMap.get(batch.id) ?? 0;
      const passed = passedMap.get(batch.id) ?? 0;
      const failed = failedMap.get(batch.id) ?? 0;

      return {
        batchId: batch.id,
        batch: batch.name,
        executedAt: batch.executedAt.toISOString(),
        total,
        passed,
        failed,
        blocked: blockedMap.get(batch.id) ?? 0,
        skipped: skippedMap.get(batch.id) ?? 0,
        passRate: percentage(passed, total),
        failRate: percentage(failed, total),
        analyzed: analyzedMap.get(batch.id) ?? 0,
      };
    });

    return NextResponse.json<TrendResponse>({ trends });
  } catch {
    return internalError("获取趋势数据失败");
  }
}
