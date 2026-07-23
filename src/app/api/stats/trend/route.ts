import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-helpers";
import type { TrendResponse } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(30, Math.max(1, Number(searchParams.get("limit")) || 10));

    const recentBatches = await prisma.batchScope.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    if (recentBatches.length === 0) {
      return NextResponse.json<TrendResponse>({ trends: [] });
    }

    const batchIds = recentBatches.map((b) => b.id);

    const [totalCounts, failedCounts, analyzedCounts] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batchIds } },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batchIds }, resultSummary: "FAIL" },
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
    const failedMap = new Map(failedCounts.map((r) => [r.batchScopeId, r._count._all]));
    const analyzedMap = new Map(analyzedCounts.map((r) => [r.batchScopeId, r._count._all]));

    const trends = recentBatches.map((batch) => ({
      batch: batch.name,
      total: totalMap.get(batch.id) ?? 0,
      failed: failedMap.get(batch.id) ?? 0,
      analyzed: analyzedMap.get(batch.id) ?? 0,
    }));

    // Return in chronological order (oldest first for chart)
    trends.reverse();

    return NextResponse.json<TrendResponse>({ trends });
  } catch {
    return internalError("获取趋势数据失败");
  }
}
