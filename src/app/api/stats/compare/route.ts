import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { CompareResponse, DiffItem } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchAId = searchParams.get("batchA");
    const batchBId = searchParams.get("batchB");

    if (!batchAId || !batchBId) {
      return jsonError("VALIDATION_ERROR", "请提供 batchA 和 batchB 参数");
    }

    const [batchA, batchB] = await Promise.all([
      prisma.batchScope.findUnique({ where: { id: batchAId } }),
      prisma.batchScope.findUnique({ where: { id: batchBId } }),
    ]);

    if (!batchA || !batchB) {
      return jsonError("NOT_FOUND", "批跑不存在", 404);
    }

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
        // Other transitions
        if (cb.resultSummary === "FAIL") {
          passToFail.push({ caseNo: ca.caseNo, name: ca.name, resultA: ca.resultSummary, resultB: "FAIL" });
        } else if (cb.resultSummary === "PASS") {
          failToPass.push({ caseNo: ca.caseNo, name: ca.name, resultA: ca.resultSummary, resultB: "PASS" });
        } else {
          unchangedCount++;
        }
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
        newInB,
        removedFromB,
      },
    });
  } catch {
    return internalError("获取对比数据失败");
  }
}