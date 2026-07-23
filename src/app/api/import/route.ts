import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { validateImportData, type ImportType, type ValidationError } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { PROGRESS_CATEGORIES } from "@/types";
import type { ImportResponse } from "@/types";

export async function POST(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();
    const {
      rows,
      importType,
      projectId,
      testStageId,
      batchScopeId,
    }: {
      rows: Record<string, unknown>[];
      importType: ImportType;
      projectId: string;
      testStageId: string;
      batchScopeId: string;
    } = body;

    // Validate required context fields
    if (!projectId || !testStageId || !batchScopeId) {
      return jsonError("VALIDATION_ERROR", "项目、阶段和批跑范围为必填");
    }

    // Validate batchScope exists and matches testStageId/projectId
    const batchRecord = await prisma.batchScope.findUnique({ where: { id: batchScopeId } });
    if (!batchRecord) {
      return jsonError("VALIDATION_ERROR", "批跑范围不存在");
    }
    if (batchRecord.testStageId !== testStageId) {
      return jsonError("VALIDATION_ERROR", "批跑范围与阶段不匹配");
    }
    if (batchRecord.projectId !== projectId) {
      return jsonError("VALIDATION_ERROR", "批跑范围与项目不匹配");
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return jsonError("VALIDATION_ERROR", "导入数据不能为空");
    }

    // Validate row data
    const errors: ValidationError[] = validateImportData(rows, importType);

    // Validate progressCategory values
    rows.forEach((row, index) => {
      if (row.progressCategory) {
        const pc = String(row.progressCategory).toUpperCase();
        if (!PROGRESS_CATEGORIES.includes(pc as typeof PROGRESS_CATEGORIES[number])) {
          errors.push({ row: index + 2, field: "progressCategory", message: "进展分类不合法" });
        }
      }
    });

    // In-batch duplicate caseNo detection
    const caseNoSet = new Set<string>();
    rows.forEach((row, index) => {
      const caseNo = String(row.caseNo ?? "");
      if (caseNoSet.has(caseNo)) {
        errors.push({
          row: index + 2,
          field: "caseNo",
          message: `用例编号 "${caseNo}" 在本次导入中重复`,
        });
      }
      caseNoSet.add(caseNo);
    });

    if (errors.length > 0) {
      return NextResponse.json<ImportResponse>(
        { imported: 0, errors },
        { status: 400 }
      );
    }

    // Transform rows to CaseResult create data
    const data = rows.map((row) => ({
      caseNo: String(row.caseNo),
      name: String(row.name),
      resultSummary: String(row.resultSummary).toUpperCase(),
      logUrl: row.logUrl ? String(row.logUrl) : null,
      projectId,
      testStageId,
      batchScopeId,
      assignee: row.assignee ? String(row.assignee) : null,
      progressCategory: row.progressCategory ? String(row.progressCategory).toUpperCase() : null,
      rootCause: row.rootCause ? String(row.rootCause) : null,
      mrOrTicket: row.mrOrTicket ? String(row.mrOrTicket) : null,
      assetSaved: false,
    }));

    // Use createMany for bulk insert
    const result = await prisma.caseResult.createMany({ data });

    return NextResponse.json<ImportResponse>(
      { imported: result.count, errors: [] },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "存在重复的用例编号", 409);
    }
    return internalError("导入失败");
  }
}
