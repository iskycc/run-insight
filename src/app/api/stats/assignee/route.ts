import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { AssigneeStat, AssigneeStatsResponse } from "@/types";
import { getProjectAccess } from "@/lib/project-access";

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
      if (!access?.canView) return jsonError("FORBIDDEN", "无权查看该项目报告", 403);
    }

    const baseWhere: Record<string, unknown> = {};
    if (projectId) baseWhere.projectId = projectId;
    if (!resolvedProjectId && user.role !== "ADMIN") {
      baseWhere.project = { members: { some: { userId: authResult.userId } } };
    }
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
