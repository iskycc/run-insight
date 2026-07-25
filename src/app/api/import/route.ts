import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { authenticateRequest, requireRole, authenticateApiKey } from "@/lib/auth";
import type { TokenPayload } from "@/lib/auth";
import { validateImportData, type ImportType, type ValidationError } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { checkRateLimit, getClientIp, importRateLimiter } from "@/lib/rate-limiter";
import { PROGRESS_CATEGORIES } from "@/types";
import type {
  ImportPreviewResponse,
  ImportResponse,
  ImportValidationErrorResponse,
} from "@/types";
import { getProjectAccess } from "@/lib/project-access";

const MAX_IMPORT_ROWS = 100_000;
const DEFAULT_FILE_NAME = "unknown";
const PREVIEW_SAMPLE_LIMIT = 5;
const EXISTING_ROW_QUERY_CHUNK_SIZE = 5_000;
const IMPORT_TYPES = ["pre-analysis", "post-analysis"] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

type ExistingCaseResult = Pick<
  CaseResultUpsertData,
  | "caseNo"
  | "name"
  | "resultSummary"
  | "logUrl"
  | "assignee"
  | "progressCategory"
  | "rootCause"
  | "mrOrTicket"
>;

type ExistingCaseSnapshot = ExistingCaseResult & {
  id: string;
  projectId: string;
  testStageId: string;
  batchScopeId: string;
  assigneeId: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW" | null;
  dueDate: Date | null;
  rootCauseCategoryId: string | null;
  notes: string | null;
  assetSaved: boolean;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const COMPARABLE_FIELDS = [
  "name",
  "resultSummary",
  "logUrl",
  "assignee",
  "progressCategory",
  "rootCause",
  "mrOrTicket",
] as const satisfies ReadonlyArray<keyof ExistingCaseResult>;

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

function normalizeFileName(fileName: unknown): string {
  if (typeof fileName !== "string" || !fileName.trim()) return DEFAULT_FILE_NAME;
  return fileName.trim().slice(0, 191);
}

function isUnchanged(existing: ExistingCaseResult, incoming: CaseResultUpsertData): boolean {
  return COMPARABLE_FIELDS.every((field) => existing[field] === incoming[field]);
}

function isImportType(value: unknown): value is ImportType {
  return (
    typeof value === "string" &&
    IMPORT_TYPES.some((candidate) => candidate === value)
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function countImportChanges(changes: Array<{ changeType: "CREATED" | "UPDATED" }>) {
  const created = changes.filter((change) => change.changeType === "CREATED").length;
  const updated = changes.length - created;
  return { created, updated };
}

function toBeforeSnapshot(row: ExistingCaseSnapshot): Prisma.InputJsonValue {
  return {
    id: row.id,
    caseNo: row.caseNo,
    name: row.name,
    resultSummary: row.resultSummary,
    logUrl: row.logUrl,
    projectId: row.projectId,
    testStageId: row.testStageId,
    batchScopeId: row.batchScopeId,
    assignee: row.assignee,
    assigneeId: row.assigneeId,
    priority: row.priority,
    dueDate: row.dueDate?.toISOString() ?? null,
    progressCategory: row.progressCategory,
    rootCause: row.rootCause,
    rootCauseCategoryId: row.rootCauseCategoryId,
    mrOrTicket: row.mrOrTicket,
    notes: row.notes,
    assetSaved: row.assetSaved,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(importRateLimiter, getClientIp(request));
  if (rateLimit) return rateLimit;

  // An explicitly supplied API key is authoritative. Never fall back to a
  // cookie when that credential is invalid, otherwise a bad key can be masked
  // by an unrelated browser session.
  const hasApiKey = request.headers.has("x-api-key");
  const apiKeyResult = await authenticateApiKey(request, prisma);
  let authResult: TokenPayload;

  if (apiKeyResult) {
    authResult = { userId: apiKeyResult.userId, username: "api-key" };
  } else if (hasApiKey) {
    return jsonError("UNAUTHORIZED", "API Key 无效", 401);
  } else {
    const jwtResult = authenticateRequest(request);
    if (jwtResult instanceof NextResponse) return jwtResult;
    authResult = jwtResult;

    const roleCheck = await requireRole(authResult.userId, ["ADMIN", "EDITOR"], prisma);
    if (roleCheck) return roleCheck;
  }

  let idempotencyContext: {
    requestId: string;
    projectId: string;
    userId: string;
  } | null = null;

  try {
    const body = await request.json();
    const {
      rows,
      importType,
      projectId,
      testStageId,
      batchScopeId,
      fileName,
      preview,
      dryRun,
      requestId,
    }: {
      rows: ImportRowInput[];
      importType: unknown;
      projectId: string;
      testStageId: string;
      batchScopeId: string;
      fileName?: string;
      preview?: boolean;
      dryRun?: boolean;
      requestId?: unknown;
    } = body;
    const importFileName = normalizeFileName(fileName);
    const isPreview = preview === true || dryRun === true;

    if (!isImportType(importType)) {
      return jsonError(
        "VALIDATION_ERROR",
        "导入类型必须为 pre-analysis 或 post-analysis"
      );
    }

    // Validate required context fields
    if (!projectId || !testStageId || !batchScopeId) {
      return jsonError("VALIDATION_ERROR", "项目、阶段和批跑范围为必填");
    }

    if (!isPreview && requestId !== undefined && requestId !== null && !isUuid(requestId)) {
      return jsonError("VALIDATION_ERROR", "requestId 必须为有效 UUID");
    }

    if (!isPreview && isUuid(requestId)) {
      idempotencyContext = {
        requestId,
        projectId,
        userId: authResult.userId,
      };
      const previous = await prisma.importRecord.findUnique({
        where: { requestId },
        include: { changes: { select: { changeType: true } } },
      });
      if (previous) {
        if (previous.userId !== authResult.userId || previous.projectId !== projectId) {
          return jsonError("IDEMPOTENCY_CONFLICT", "requestId 已被其他导入请求使用", 409);
        }
        const counts = countImportChanges(previous.changes);
        return NextResponse.json<ImportResponse>({
          imported: previous.importedCount,
          created: counts.created,
          updated: counts.updated,
          unchanged: Math.max(0, previous.totalRows - previous.importedCount),
          errors: [],
        });
      }
    }

    if (apiKeyResult && apiKeyResult.projectId !== projectId) {
      return jsonError("FORBIDDEN", "API Key 无权访问该项目", 403);
    }
    if (!apiKeyResult) {
      const access = await getProjectAccess(prisma, authResult.userId, projectId);
      if (!access?.canEdit) return jsonError("FORBIDDEN", "无权导入到该项目", 403);
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
      if (!isPreview) {
        try {
          await prisma.importRecord.create({
            data: {
              projectId,
              importType: importType || "pre-analysis",
              fileName: importFileName,
              totalRows: rows.length,
              importedCount: 0,
              errorCount: errors.length,
              errors: errors as unknown as Prisma.InputJsonValue,
              userId: authResult.userId,
            },
          });
        } catch {
          // History persistence is best-effort here. The caller still needs the
          // original row-level validation details to correct and retry the file.
        }
      }

      return NextResponse.json<ImportValidationErrorResponse>(
        {
          error: "VALIDATION_ERROR",
          message: `${errors.length} 个导入字段校验错误`,
          details: errors,
        },
        { status: 400 }
      );
    }

    // Transform rows to CaseResult upsert data
    const upsertData: CaseResultUpsertData[] = rows.map((row) =>
      transformRow(row, { projectId, testStageId, batchScopeId })
    );

    if (isPreview) {
      const existingRows: ExistingCaseResult[] = [];
      for (let offset = 0; offset < upsertData.length; offset += EXISTING_ROW_QUERY_CHUNK_SIZE) {
        const chunk = upsertData.slice(offset, offset + EXISTING_ROW_QUERY_CHUNK_SIZE);
        existingRows.push(...await prisma.caseResult.findMany({
          where: {
            projectId,
            testStageId,
            batchScopeId,
            caseNo: { in: chunk.map((data) => data.caseNo) },
          },
          select: {
            caseNo: true,
            name: true,
            resultSummary: true,
            logUrl: true,
            assignee: true,
            progressCategory: true,
            rootCause: true,
            mrOrTicket: true,
          },
        }));
      }
      const existingByCaseNo = new Map(
        existingRows.map((row) => [row.caseNo, row])
      );
      const samples: ImportPreviewResponse["samples"] = {
        created: [],
        updated: [],
        unchanged: [],
      };
      let created = 0;
      let updated = 0;
      let unchanged = 0;

      for (const data of upsertData) {
        const existing = existingByCaseNo.get(data.caseNo);
        const status = !existing
          ? "created"
          : isUnchanged(existing, data)
            ? "unchanged"
            : "updated";

        if (status === "created") created += 1;
        if (status === "updated") updated += 1;
        if (status === "unchanged") unchanged += 1;
        if (samples[status].length < PREVIEW_SAMPLE_LIMIT) {
          samples[status].push({ caseNo: data.caseNo, name: data.name });
        }
      }

      return NextResponse.json<ImportPreviewResponse>({
        preview: true,
        total: upsertData.length,
        created,
        updated,
        unchanged,
        samples,
        errors: [],
      });
    }

    // Run upserts + import record + audit log inside a single transaction
    // so that partial failures roll back together.
    const result = await prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      const existingRows: ExistingCaseSnapshot[] = [];
      for (let offset = 0; offset < upsertData.length; offset += EXISTING_ROW_QUERY_CHUNK_SIZE) {
        const chunk = upsertData.slice(offset, offset + EXISTING_ROW_QUERY_CHUNK_SIZE);
        existingRows.push(...await tx.caseResult.findMany({
          where: {
            projectId,
            testStageId,
            batchScopeId,
            caseNo: { in: chunk.map((data) => data.caseNo) },
          },
          select: {
            id: true,
            caseNo: true,
            name: true,
            resultSummary: true,
            logUrl: true,
            projectId: true,
            testStageId: true,
            batchScopeId: true,
            assignee: true,
            assigneeId: true,
            priority: true,
            dueDate: true,
            progressCategory: true,
            rootCause: true,
            rootCauseCategoryId: true,
            mrOrTicket: true,
            notes: true,
            assetSaved: true,
            updatedBy: true,
            createdAt: true,
            updatedAt: true,
          },
        }));
      }
      const existingByCaseNo = new Map(existingRows.map((row) => [row.caseNo, row]));
      const importRecord = await tx.importRecord.create({
        data: {
          projectId,
          importType,
          fileName: importFileName,
          totalRows: rows.length,
          importedCount: 0,
          errorCount: 0,
          userId: authResult.userId,
          requestId: isUuid(requestId) ? requestId : null,
        },
      });

      for (const data of upsertData) {
        const existing = existingByCaseNo.get(data.caseNo);
        if (existing && isUnchanged(existing, data)) continue;

        const changedCase = await tx.caseResult.upsert({
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
          select: { id: true, updatedAt: true },
        });

        if (existing) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }

        await tx.importChange.create({
          data: {
            importRecordId: importRecord.id,
            caseResultId: changedCase.id,
            changeType: existing ? "UPDATED" : "CREATED",
            before: existing ? toBeforeSnapshot(existing) : undefined,
            appliedUpdatedAt: changedCase.updatedAt,
          },
        });
      }

      await tx.importRecord.update({
        where: { id: importRecord.id },
        data: { importedCount: createdCount + updatedCount },
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
            fileName: importFileName,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        imported: createdCount + updatedCount,
        created: createdCount,
        updated: updatedCount,
        unchanged: rows.length - createdCount - updatedCount,
      };
    }, { timeout: 60_000 });

    return NextResponse.json<ImportResponse>(
      { ...result, errors: [] },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      if (idempotencyContext) {
        const previous = await prisma.importRecord.findUnique({
          where: { requestId: idempotencyContext.requestId },
          include: { changes: { select: { changeType: true } } },
        });
        if (previous) {
          if (
            previous.userId !== idempotencyContext.userId ||
            previous.projectId !== idempotencyContext.projectId
          ) {
            return jsonError(
              "IDEMPOTENCY_CONFLICT",
              "requestId 已被其他导入请求使用",
              409
            );
          }
          const counts = countImportChanges(previous.changes);
          return NextResponse.json<ImportResponse>({
            imported: previous.importedCount,
            created: counts.created,
            updated: counts.updated,
            unchanged: Math.max(0, previous.totalRows - previous.importedCount),
            errors: [],
          });
        }
      }
      return jsonError("CONFLICT", "存在重复的用例编号", 409);
    }
    return internalError("导入失败");
  }
}
