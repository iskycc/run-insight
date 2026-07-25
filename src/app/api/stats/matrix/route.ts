import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { MatrixResponse, MatrixRow } from "@/types";
import { getProjectAccess } from "@/lib/project-access";

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const stageId = searchParams.get("stageId");
    const batchIdsParam = searchParams.get("batchIds");

    if (!batchIdsParam) {
      return jsonError("VALIDATION_ERROR", "请提供 batchIds 参数（逗号分隔）");
    }

    const batchIds = Array.from(new Set(batchIdsParam.split(",").filter(Boolean)));
    if (batchIds.length < 2) {
      return jsonError("VALIDATION_ERROR", "至少需要 2 个批跑");
    }

    const batches = await prisma.batchScope.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, name: true, projectId: true, testStageId: true },
        orderBy: { createdAt: "asc" },
      });
    if (batches.length !== batchIds.length) {
      return jsonError("NOT_FOUND", "部分批跑不存在", 404);
    }
    const resolvedProjectId = batches[0].projectId;
    const resolvedStageId = batches[0].testStageId;
    if (
      batches.some(
        (batch) =>
          batch.projectId !== resolvedProjectId ||
          batch.testStageId !== resolvedStageId
      ) ||
      (projectId && projectId !== resolvedProjectId) ||
      (stageId && stageId !== resolvedStageId)
    ) {
      return jsonError("VALIDATION_ERROR", "批跑必须属于同一项目和阶段");
    }
    const access = await getProjectAccess(prisma, authResult.userId, resolvedProjectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权访问这些批跑", 403);

    const cases = await prisma.caseResult.findMany({
      where: {
        batchScopeId: { in: batchIds },
        projectId: resolvedProjectId,
        testStageId: resolvedStageId,
      },
      select: { caseNo: true, name: true, batchScopeId: true, resultSummary: true },
      orderBy: { caseNo: "asc" },
    });

    const rowMap = new Map<string, MatrixRow>();
    for (const c of cases) {
      if (!rowMap.has(c.caseNo)) {
        rowMap.set(c.caseNo, { caseNo: c.caseNo, name: c.name, results: {} });
      }
      rowMap.get(c.caseNo)!.results[c.batchScopeId] = c.resultSummary;
    }

    const rows = Array.from(rowMap.values());

    return NextResponse.json<MatrixResponse>({
      batches: batches.map((b) => ({ id: b.id, name: b.name })),
      rows,
    });
  } catch {
    return internalError("获取矩阵数据失败");
  }
}
