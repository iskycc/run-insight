import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { authenticateRequest, requireRole, authenticateApiKey } from "@/lib/auth";
import type { TokenPayload } from "@/lib/auth";
import { validateImportData, type ImportType, type ValidationError } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { checkRateLimit, getClientIp, importRateLimiter } from "@/lib/rate-limiter";
import { PROGRESS_CATEGORIES } from "@/types";
import type { ImportResponse } from "@/types";

const MAX_IMPORT_ROWS = 100_000;

type ImportRowInput = Record<string, unknown>;

interface CaseResultUpsertData {
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string | null;
  projectId: string;
  testStageId: string;
  batchScopeId: string;
  assignee: string | null;
  progressCategory: string | null;
  rootCause: string | null;
  mrOrTicket: string | null;
}

function transformRow(row: ImportRowInput, context: { projectId: string; testStageId: string; batchScopeId: string }): CaseResultUpsertData {
  return {
    caseNo: String(row.caseNo),
    name: String(row.name),
    resultSummary: String(row.resultSummary).toUpperCase(),
    logUrl: row.logUrl ? String(row.logUrl) : null,
    projectId: context.projectId,
    testStageId: context.testStageId,
    batchScopeId: context.batchScopeId,
    assignee: row.assignee ? String(row.assignee) : null,
    progressCategory: row.progressCategory ? String(row.progressCategory).toUpperCase() : null,
    rootCause: row.rootCause ? String(row.rootCause) : null,
    mrOrTicket: row.mrOrTicket ? String(row.mrOrTicket) : null,
  };
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(importRateLimiter, getClientIp(request));
  if (rateLimit) return rateLimit;

  // Try API Key authentication first
  const apiKeyResult = await authenticateApiKey(request, prisma);
  let authResult: TokenPayload;

  if (apiKeyResult) {
    authResult = { userId: apiKeyResult.userId, username: "api-key" };
  } else {
    const jwtResult = authenticateRequest(request);
    if (jwtResult instanceof NextResponse) return jwtResult;
    authResult = jwtResult;

    const roleCheck = await requireRole(authResult.userId, ["ADMIN", "EDITOR"], prisma);
    if (roleCheck) return roleCheck;
  }

  try {
    const body = await request.json();
    const {
      rows,
      importType,
      projectId,
      testStageId,
      batchScopeId,
      fileName,
    }: {
      rows: ImportRowInput[];
      importType: ImportType;
      projectId: string;
      testStageId: string;
      batchScopeId: string;
      fileName?: string;
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

    if (rows.length > MAX_IMPORT_ROWS) {
      return jsonError("VALIDATION_ERROR", `数据行数 (${rows.length}) 超过上限 ${MAX_IMPORT_ROWS}`);
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

    // Transform rows to CaseResult upsert data
    const upsertData: CaseResultUpsertData[] = rows.map((row) =>
      transformRow(row, { projectId, testStageId, batchScopeId })
    );

    // Run upserts + import record + audit log inside a single transaction
    // so that partial failures roll back together.
    const { imported } = await prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (const data of upsertData) {
        const result = await tx.caseResult.upsert({
          where: {
            projectId_testStageId_batchScopeId_caseNo: {
              projectId: data.projectId,
              testStageId: data.testStageId,
              batchScopeId: data.batchScopeId,
              caseNo: data.caseNo,
            },
          },
          create: {
            ...data,
            assetSaved: false,
          },
          update: {
            // Re-importing the same caseNo re-syncs execution result fields
            // but preserves analysis fields that are not in the import payload
            // (assignee / progressCategory / rootCause / mrOrTicket are explicit
            // so re-analysis imports can still update them).
            name: data.name,
            resultSummary: data.resultSummary,
            logUrl: data.logUrl,
            assignee: data.assignee,
            progressCategory: data.progressCategory,
            rootCause: data.rootCause,
            mrOrTicket: data.mrOrTicket,
          },
          select: { createdAt: true, updatedAt: true, assetSaved: true },
        });

        if (result.assetSaved === undefined) {
          // Defensive: should not happen because we always select, but keep TS happy
          createdCount += 1;
        } else if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          createdCount += 1;
        } else {
          updatedCount += 1;
        }
      }

      await tx.importRecord.create({
        data: {
          projectId,
          importType: importType || "pre-analysis",
          fileName: fileName || "unknown",
          totalRows: rows.length,
          importedCount: createdCount + updatedCount,
          errorCount: 0,
          userId: authResult.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: authResult.userId,
          action: "CREATE",
          entityType: "case",
          entityId: batchScopeId,
          changes: {
            imported: createdCount + updatedCount,
            created: createdCount,
            updated: updatedCount,
            fileName: fileName || "unknown",
          } as Prisma.InputJsonValue,
        },
      });

      return {
        imported: createdCount + updatedCount,
        created: createdCount,
        updated: updatedCount,
      };
    }, { timeout: 60_000 });

    return NextResponse.json<ImportResponse>(
      { imported, errors: [] },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "存在重复的用例编号", 409);
    }
    return internalError("导入失败");
  }
}
