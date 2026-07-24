import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError } from "@/lib/api-helpers";
import Papa from "papaparse";

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const stageId = searchParams.get("testStageId") || undefined;
    const batchId = searchParams.get("batchScopeId") || undefined;
    const format = searchParams.get("format") || "csv";

    const where: Record<string, unknown> = {};
    if (projectId) where.projectId = projectId;
    if (stageId) where.testStageId = stageId;
    if (batchId) where.batchScopeId = batchId;

    const cases = await prisma.caseResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const rows = cases.map((c) => ({
      caseNo: c.caseNo,
      name: c.name,
      resultSummary: c.resultSummary,
      logUrl: c.logUrl ?? "",
      assignee: c.assignee ?? "",
      progressCategory: c.progressCategory ?? "",
      rootCause: c.rootCause ?? "",
      mrOrTicket: c.mrOrTicket ?? "",
      assetSaved: c.assetSaved ? "是" : "否",
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    if (format === "json") {
      return NextResponse.json({ cases: rows });
    }

    const csv = Papa.unparse(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cases-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch {
    return internalError("导出失败");
  }
}