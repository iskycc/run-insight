import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { MatrixResponse, MatrixRow } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const stageId = searchParams.get("stageId");
    const batchIdsParam = searchParams.get("batchIds");

    if (!batchIdsParam) {
      return jsonError("VALIDATION_ERROR", "请提供 batchIds 参数（逗号分隔）");
    }

    const batchIds = batchIdsParam.split(",").filter(Boolean);
    if (batchIds.length < 2) {
      return jsonError("VALIDATION_ERROR", "至少需要 2 个批跑");
    }

    const where: Record<string, unknown> = { batchScopeId: { in: batchIds } };
    if (projectId) where.projectId = projectId;
    if (stageId) where.testStageId = stageId;

    const [batches, cases] = await Promise.all([
      prisma.batchScope.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.caseResult.findMany({
        where,
        select: { caseNo: true, name: true, batchScopeId: true, resultSummary: true },
        orderBy: { caseNo: "asc" },
      }),
    ]);

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