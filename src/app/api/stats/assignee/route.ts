import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError } from "@/lib/api-helpers";
import type { AssigneeStat, AssigneeStatsResponse } from "@/types";

/**
 * GET /api/stats/assignee
 * Query params:
 *   - projectId?: string
 *   - testStageId?: string
 *   - batchScopeId?: string
 *
 * Returns one row per assignee with case counts and fix rate.
 * Sorted by failCount desc (assignees with no failures appear last).
 */
export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const testStageId = searchParams.get("testStageId") || undefined;
    const batchScopeId = searchParams.get("batchScopeId") || undefined;

    const baseWhere: Record<string, unknown> = {};
    if (projectId) baseWhere.projectId = projectId;
    if (testStageId) baseWhere.testStageId = testStageId;
    if (batchScopeId) baseWhere.batchScopeId = batchScopeId;

    const [
      totalGroups,
      failGroups,
      fixGroups,
      savedGroups,
    ] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["assignee"],
        where: { ...baseWhere, assignee: { not: null } },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["assignee"],
        where: { ...baseWhere, assignee: { not: null }, resultSummary: "FAIL" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["assignee"],
        where: { ...baseWhere, assignee: { not: null }, progressCategory: "FIXED" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["assignee"],
        where: { ...baseWhere, assignee: { not: null }, assetSaved: true },
        _count: { _all: true },
      }),
    ]);

    const statsMap = new Map<string, AssigneeStat>();
    for (const g of totalGroups) {
      if (!g.assignee) continue;
      statsMap.set(g.assignee, {
        assignee: g.assignee,
        totalCases: g._count._all,
        failCount: 0,
        fixCount: 0,
        savedAssetCount: 0,
        fixRate: 0,
      });
    }
    for (const g of failGroups) {
      if (!g.assignee) continue;
      const entry = statsMap.get(g.assignee) ?? {
        assignee: g.assignee,
        totalCases: 0,
        failCount: 0,
        fixCount: 0,
        savedAssetCount: 0,
        fixRate: 0,
      };
      entry.failCount = g._count._all;
      statsMap.set(g.assignee, entry);
    }
    for (const g of fixGroups) {
      if (!g.assignee) continue;
      const entry = statsMap.get(g.assignee) ?? {
        assignee: g.assignee,
        totalCases: 0,
        failCount: 0,
        fixCount: 0,
        savedAssetCount: 0,
        fixRate: 0,
      };
      entry.fixCount = g._count._all;
      statsMap.set(g.assignee, entry);
    }
    for (const g of savedGroups) {
      if (!g.assignee) continue;
      const entry = statsMap.get(g.assignee) ?? {
        assignee: g.assignee,
        totalCases: 0,
        failCount: 0,
        fixCount: 0,
        savedAssetCount: 0,
        fixRate: 0,
      };
      entry.savedAssetCount = g._count._all;
      statsMap.set(g.assignee, entry);
    }

    const stats: AssigneeStat[] = Array.from(statsMap.values()).map((s) => ({
      ...s,
      fixRate: s.failCount === 0 ? 0 : Number((s.fixCount / s.failCount).toFixed(2)),
    }));

    stats.sort((a, b) => {
      if (b.failCount !== a.failCount) return b.failCount - a.failCount;
      return a.assignee.localeCompare(b.assignee);
    });

    return NextResponse.json<AssigneeStatsResponse>({ stats });
  } catch {
    return internalError("获取责任人统计失败");
  }
}