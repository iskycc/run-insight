import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { CompareResponse, DiffItem } from "@/types";
import { getProjectAccess } from "@/lib/project-access";

export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const batchAId = searchParams.get("batchA");
    const batchBId = searchParams.get("batchB");

    if (!batchAId || !batchBId) {
      return jsonError("VALIDATION_ERROR", "请提供 batchA 和 batchB 参数");
    }
    if (batchAId === batchBId) {
      return jsonError("VALIDATION_ERROR", "batchA 和 batchB 不能相同");
    }

    const [batchA, batchB] = await Promise.all([
      prisma.batchScope.findUnique({ where: { id: batchAId } }),
      prisma.batchScope.findUnique({ where: { id: batchBId } }),
    ]);

    if (!batchA || !batchB) {
      return jsonError("NOT_FOUND", "批跑不存在", 404);
    }
    if (
      batchA.projectId !== batchB.projectId ||
      batchA.testStageId !== batchB.testStageId
    ) {
      return jsonError("VALIDATION_ERROR", "只能对比同一项目、同一阶段的批跑");
    }
    const access = await getProjectAccess(prisma, authResult.userId, batchA.projectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权访问这些批跑", 403);

    const [casesA, casesB] = await Promise.all([
      prisma.caseResult.findMany({
        where: { batchScopeId: batchAId },
        select: { caseNo: true, name: true, resultSummary: true },
        orderBy: { caseNo: "asc" },
      }),
      prisma.caseResult.findMany({
        where: { batchScopeId: batchBId },
        select: { caseNo: true, name: true, resultSummary: true },
        orderBy: { caseNo: "asc" },
      }),
    ]);

    const mapA = new Map(casesA.map((c) => [c.caseNo, c]));
    const mapB = new Map(casesB.map((c) => [c.caseNo, c]));

    const passToFail: DiffItem[] = [];
    const failToPass: DiffItem[] = [];
    const otherChanges: DiffItem[] = [];
    const newInB: DiffItem[] = [];
    const removedFromB: DiffItem[] = [];
    let unchangedCount = 0;

    // Check cases in A
    for (const [caseNo, ca] of mapA) {
      const cb = mapB.get(caseNo);
      if (!cb) {
        removedFromB.push({ caseNo: ca.caseNo, name: ca.name, resultA: ca.resultSummary, resultB: "-" });
      } else if (ca.resultSummary === cb.resultSummary) {
        unchangedCount++;
      } else if (ca.resultSummary === "PASS" && cb.resultSummary === "FAIL") {
        passToFail.push({ caseNo: ca.caseNo, name: ca.name, resultA: "PASS", resultB: "FAIL" });
      } else if (ca.resultSummary === "FAIL" && cb.resultSummary === "PASS") {
        failToPass.push({ caseNo: ca.caseNo, name: ca.name, resultA: "FAIL", resultB: "PASS" });
      } else {
        otherChanges.push({
          caseNo: ca.caseNo,
          name: ca.name,
          resultA: ca.resultSummary,
          resultB: cb.resultSummary,
        });
      }
    }

    // Check new cases in B
    for (const [caseNo, cb] of mapB) {
      if (!mapA.has(caseNo)) {
        newInB.push({ caseNo: cb.caseNo, name: cb.name, resultA: "-", resultB: cb.resultSummary });
      }
    }

    return NextResponse.json<CompareResponse>({
      batchA: { id: batchA.id, name: batchA.name, caseCount: casesA.length },
      batchB: { id: batchB.id, name: batchB.name, caseCount: casesB.length },
      diff: {
        unchanged: unchangedCount,
        passToFail,
        failToPass,
        otherChanges,
        newInB,
        removedFromB,
      },
    });
  } catch {
    return internalError("获取对比数据失败");
  }
}
