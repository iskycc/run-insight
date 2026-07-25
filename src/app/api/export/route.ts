import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import Papa from "papaparse";
import ExcelJS from "exceljs";

const EXPORT_COLUMNS = [
  { header: "用例编号", key: "caseNo", width: 20 },
  { header: "用例名称", key: "name", width: 30 },
  { header: "结果概要", key: "resultSummary", width: 12 },
  { header: "日志链接", key: "logUrl", width: 40 },
  { header: "责任人", key: "assignee", width: 16 },
  { header: "进展分类", key: "progressCategory", width: 14 },
  { header: "根因", key: "rootCause", width: 30 },
  { header: "MR/单号", key: "mrOrTicket", width: 20 },
  { header: "已存资产", key: "assetSaved", width: 12 },
  { header: "创建时间", key: "createdAt", width: 24 },
  { header: "更新时间", key: "updatedAt", width: 24 },
] as const;

type CaseRow = {
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string;
  assignee: string;
  progressCategory: string;
  rootCause: string;
  mrOrTicket: string;
  assetSaved: string;
  createdAt: string;
  updatedAt: string;
};

function buildWhere(params: URLSearchParams) {
  const where: Record<string, unknown> = {};
  const projectId = params.get("projectId") || undefined;
  const testStageId = params.get("testStageId") || undefined;
  const batchScopeId = params.get("batchScopeId") || undefined;
  if (projectId) where.projectId = projectId;
  if (testStageId) where.testStageId = testStageId;
  if (batchScopeId) where.batchScopeId = batchScopeId;
  return where;
}

function toRows(cases: Array<{
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string | null;
  assignee: string | null;
  progressCategory: string | null;
  rootCause: string | null;
  mrOrTicket: string | null;
  assetSaved: boolean;
  createdAt: Date;
  updatedAt: Date;
}>): CaseRow[] {
  return cases.map((c) => ({
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
}

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "csv").toLowerCase();

    const where = buildWhere(searchParams);
    const cases = await prisma.caseResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    const rows = toRows(cases);
    const today = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      return NextResponse.json({ cases: rows });
    }

    if (format === "xlsx" || format === "excel") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Run Insight";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("用例结果");
      sheet.columns = EXPORT_COLUMNS.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width,
      }));
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E6F1" },
      };
      rows.forEach((row) => sheet.addRow(row));

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="run-insight-${today}.xlsx"`,
        },
      });
    }

    if (format !== "csv") {
      return jsonError("VALIDATION_ERROR", `不支持的导出格式: ${format}`);
    }

    const csv = Papa.unparse(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cases-${today}.csv"`,
      },
    });
  } catch {
    return internalError("导出失败");
  }
}
