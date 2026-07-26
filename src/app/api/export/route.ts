import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseRequestUrl,
} from "@/lib/api-helpers";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { getProjectAccess } from "@/lib/project-access";
import { writeAuditLog } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";
import { PROGRESS_CATEGORIES, RESULT_SUMMARIES } from "@/types";

const EXPORT_FORMATS = ["csv", "json", "xlsx", "excel"] as const;
const STREAM_BATCH_SIZE = 500;
const EXCEL_MAX_ROWS = 10_000;
const SORTABLE_FIELDS = [
  "caseNo",
  "name",
  "resultSummary",
  "assignee",
  "priority",
  "dueDate",
  "progressCategory",
  "assetSaved",
  "createdAt",
  "updatedAt",
] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];
type SortableField = (typeof SORTABLE_FIELDS)[number];

const EXPORT_COLUMNS = [
  { header: "用例编号", key: "caseNo", width: 20 },
  { header: "用例名称", key: "name", width: 30 },
  { header: "结果概要", key: "resultSummary", width: 12 },
  { header: "日志链接", key: "logUrl", width: 40 },
  { header: "责任人", key: "assignee", width: 16 },
  { header: "优先级", key: "priority", width: 12 },
  { header: "截止日期", key: "dueDate", width: 24 },
  { header: "进展分类", key: "progressCategory", width: 14 },
  { header: "根因", key: "rootCause", width: 30 },
  { header: "根因分类", key: "rootCauseCategory", width: 20 },
  { header: "MR/单号", key: "mrOrTicket", width: 20 },
  { header: "备注", key: "notes", width: 40 },
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
  priority: string;
  dueDate: string;
  progressCategory: string;
  rootCause: string;
  rootCauseCategory: string;
  mrOrTicket: string;
  notes: string;
  assetSaved: string;
  createdAt: string;
  updatedAt: string;
};

type CaseRecord = {
  id: string;
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string | null;
  assignee: string | null;
  priority: string | null;
  dueDate: Date | null;
  progressCategory: string | null;
  rootCause: string | null;
  rootCauseCategory?: { name: string } | null;
  mrOrTicket: string | null;
  notes: string | null;
  assetSaved: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function parseDateFilter(value: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function validateExportParams(params: URLSearchParams): string | null {
  const progressCategory = params.get("progressCategory");
  if (
    progressCategory !== null &&
    !PROGRESS_CATEGORIES.includes(
      progressCategory as (typeof PROGRESS_CATEGORIES)[number]
    )
  ) {
    return "进展分类筛选值不合法";
  }
  const resultSummary = params.get("resultSummary");
  if (
    resultSummary !== null &&
    !RESULT_SUMMARIES.includes(
      resultSummary as (typeof RESULT_SUMMARIES)[number]
    )
  ) {
    return "结果概要筛选值不合法";
  }
  const assetSaved = params.get("assetSaved");
  if (
    assetSaved !== null &&
    assetSaved !== "true" &&
    assetSaved !== "false"
  ) {
    return "资产状态筛选值必须为 true 或 false";
  }
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const from = dateFrom === null ? null : parseDateFilter(dateFrom, false);
  const to = dateTo === null ? null : parseDateFilter(dateTo, true);
  if (dateFrom !== null && !from) return "开始日期格式不合法";
  if (dateTo !== null && !to) return "结束日期格式不合法";
  if (from && to && from > to) return "开始日期不能晚于结束日期";

  const sortField = params.get("sortField");
  if (
    sortField !== null &&
    !SORTABLE_FIELDS.includes(sortField as SortableField)
  ) {
    return "排序字段不合法";
  }
  const sortOrder = params.get("sortOrder");
  if (sortOrder !== null && sortOrder !== "asc" && sortOrder !== "desc") {
    return "排序方向不合法";
  }
  return null;
}

function buildWhere(params: URLSearchParams): Prisma.CaseResultWhereInput {
  const where: Prisma.CaseResultWhereInput = {};
  const projectId = params.get("projectId") || undefined;
  const testStageId = params.get("testStageId") || undefined;
  const batchScopeId = params.get("batchScopeId") || undefined;
  const progressCategory = params.get("progressCategory");
  const assetSaved = params.get("assetSaved");
  const resultSummary = params.get("resultSummary");
  const assignee = params.get("assignee") || undefined;
  const rootCause = params.get("rootCause") || undefined;
  const search = params.get("search") || undefined;
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");

  if (projectId) where.projectId = projectId;
  if (testStageId) where.testStageId = testStageId;
  if (batchScopeId) where.batchScopeId = batchScopeId;
  if (progressCategory) where.progressCategory = progressCategory;
  if (assetSaved !== null) where.assetSaved = assetSaved === "true";
  if (resultSummary) where.resultSummary = resultSummary;
  if (assignee) where.assignee = { contains: assignee };
  if (rootCause) where.rootCause = { contains: rootCause };
  if (search) {
    where.OR = [
      { caseNo: { contains: search } },
      { name: { contains: search } },
    ];
  }
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.gte = parseDateFilter(dateFrom, false)!;
    if (dateTo) createdAt.lte = parseDateFilter(dateTo, true)!;
    where.createdAt = createdAt;
  }

  return where;
}

function toRows(cases: CaseRecord[]): CaseRow[] {
  return cases.map((c) => ({
    caseNo: c.caseNo,
    name: c.name,
    resultSummary: c.resultSummary,
    logUrl: c.logUrl ?? "",
    assignee: c.assignee ?? "",
    priority: c.priority ?? "",
    dueDate: c.dueDate?.toISOString() ?? "",
    progressCategory: c.progressCategory ?? "",
    rootCause: c.rootCause ?? "",
    rootCauseCategory: c.rootCauseCategory?.name ?? "",
    mrOrTicket: c.mrOrTicket ?? "",
    notes: c.notes ?? "",
    assetSaved: c.assetSaved ? "是" : "否",
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

const CSV_COLUMN_KEYS = EXPORT_COLUMNS.map((column) => column.key);
const CSV_HEADER = Papa.unparse(
  { fields: CSV_COLUMN_KEYS, data: [] },
  { escapeFormulae: true, newline: "\r\n" },
);

function csvBatch(rows: CaseRow[]): string {
  return Papa.unparse(rows, {
    columns: CSV_COLUMN_KEYS,
    escapeFormulae: true,
    header: false,
    newline: "\r\n",
  });
}

function createCaseExportStream({
  initialCases,
  format,
  signal,
  fetchNext,
  recordExport,
}: {
  initialCases: CaseRecord[];
  format: "csv" | "json";
  signal?: AbortSignal;
  fetchNext: (cursorId: string) => Promise<CaseRecord[]>;
  recordExport: (rowCount: number, cancelled: boolean) => Promise<void>;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cases = initialCases;
  let emittedRows = 0;
  let firstJsonRow = true;
  let cancelled = signal?.aborted ?? false;
  let consumerCancelled = false;
  let finalized = false;

  const handleAbort = () => {
    cancelled = true;
  };
  signal?.addEventListener("abort", handleAbort, { once: true });

  const finalize = async (wasCancelled: boolean) => {
    if (finalized) return;
    finalized = true;
    signal?.removeEventListener("abort", handleAbort);
    await recordExport(emittedRows, wasCancelled);
  };

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        controller.enqueue(
          encoder.encode(format === "json" ? '{"cases":[' : `\uFEFF${CSV_HEADER}`),
        );
      },
      async pull(controller) {
        if (cancelled) {
          await finalize(true);
          if (!consumerCancelled) controller.close();
          return;
        }

        try {
          if (cases.length === 0) {
            await finalize(false);
            if (consumerCancelled) return;
            if (format === "json") controller.enqueue(encoder.encode("]}"));
            controller.close();
            return;
          }

          const currentCases = cases;
          cases = [];
          const rows = toRows(currentCases);
          emittedRows += rows.length;

          if (format === "json") {
            const serialized = rows.map((row) => JSON.stringify(row)).join(",");
            controller.enqueue(
              encoder.encode(`${firstJsonRow ? "" : ","}${serialized}`),
            );
            firstJsonRow = false;
          } else {
            controller.enqueue(encoder.encode(`${csvBatch(rows)}\r\n`));
          }

          if (currentCases.length < STREAM_BATCH_SIZE) {
            await finalize(false);
            if (consumerCancelled) return;
            if (format === "json") controller.enqueue(encoder.encode("]}"));
            controller.close();
            return;
          }

          const nextCases = await fetchNext(currentCases[currentCases.length - 1].id);
          if (cancelled) {
            await finalize(true);
            if (!consumerCancelled) controller.close();
            return;
          }
          cases = nextCases;
        } catch (error) {
          signal?.removeEventListener("abort", handleAbort);
          controller.error(error);
        }
      },
      async cancel() {
        consumerCancelled = true;
        cancelled = true;
        await finalize(true);
      },
    },
    { highWaterMark: 0 },
  );
}

export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const parsedUrl = parseRequestUrl(request);
    if (!parsedUrl.ok) return parsedUrl.response;
    const { searchParams } = parsedUrl.value;
    const requestedFormat = (searchParams.get("format") || "csv").toLowerCase();
    if (!EXPORT_FORMATS.includes(requestedFormat as ExportFormat)) {
      return jsonError("VALIDATION_ERROR", `不支持的导出格式: ${requestedFormat}`);
    }
    const format = requestedFormat as ExportFormat;
    const validationError = validateExportParams(searchParams);
    if (validationError) return jsonError("VALIDATION_ERROR", validationError);

    const where = buildWhere(searchParams);
    const sortField = (searchParams.get("sortField") || "createdAt") as SortableField;
    const sortOrder: Prisma.SortOrder =
      searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const projectId = searchParams.get("projectId") || undefined;
    const stageId = searchParams.get("testStageId") || undefined;
    const batchId = searchParams.get("batchScopeId") || undefined;
    let resolvedProjectId = projectId;
    if (stageId) {
      const stage = await prisma.testStage.findUnique({
        where: { id: stageId },
        select: { projectId: true },
      });
      if (!stage) return jsonError("NOT_FOUND", "阶段不存在", 404);
      if (resolvedProjectId && resolvedProjectId !== stage.projectId) {
        return jsonError("VALIDATION_ERROR", "阶段与项目不匹配");
      }
      resolvedProjectId = stage.projectId;
    }
    if (batchId) {
      const batch = await prisma.batchScope.findUnique({
        where: { id: batchId },
        select: { projectId: true, testStageId: true },
      });
      if (!batch) return jsonError("NOT_FOUND", "批跑不存在", 404);
      if (
        (resolvedProjectId && resolvedProjectId !== batch.projectId) ||
        (stageId && stageId !== batch.testStageId)
      ) {
        return jsonError("VALIDATION_ERROR", "批跑与项目或阶段不匹配");
      }
      resolvedProjectId = batch.projectId;
    }
    if (resolvedProjectId) {
      const access = await getProjectAccess(prisma, authResult.userId, resolvedProjectId);
      if (!access?.canView) return jsonError("FORBIDDEN", "无权导出该项目", 403);
    } else {
      const user = await prisma.user.findUnique({
        where: { id: authResult.userId },
        select: { role: true },
      });
      if (!user) return jsonError("UNAUTHORIZED", "用户不存在", 401);
      if (user.role !== "ADMIN") {
        where.project = { members: { some: { userId: authResult.userId } } };
      }
    }
    const orderBy = [
      { [sortField]: sortOrder },
      { id: sortOrder },
    ] as Prisma.CaseResultOrderByWithRelationInput[];
    const findCases = (cursorId?: string, take = STREAM_BATCH_SIZE) =>
      prisma.caseResult.findMany({
        where,
        include: { rootCauseCategory: { select: { name: true } } },
        orderBy,
        take,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
    const today = new Date().toISOString().slice(0, 10);
    const recordExport = async (rowCount: number, cancelled = false) => {
      await writeAuditLog({
        userId: authResult.userId,
        action: "EXPORT",
        entityType: "export",
        entityId: resolvedProjectId ?? "all",
        changes: {
          format,
          rowCount,
          projectId: resolvedProjectId,
          stageId,
          batchId,
          ...(cancelled ? { cancelled: true } : {}),
        },
      });
    };

    if (format === "xlsx" || format === "excel") {
      const cases = await findCases(undefined, EXCEL_MAX_ROWS + 1);
      if (cases.length > EXCEL_MAX_ROWS) {
        return jsonError(
          "EXPORT_TOO_LARGE",
          `Excel 导出最多支持 ${EXCEL_MAX_ROWS} 行，请缩小筛选范围或改用 CSV 导出`,
          413,
        );
      }
      const rows = toRows(cases);
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
      await recordExport(rows.length);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="run-insight-${today}.xlsx"`,
        },
      });
    }

    const initialCases = await findCases();
    const stream = createCaseExportStream({
      initialCases,
      format,
      signal: request.signal,
      fetchNext: (cursorId) => findCases(cursorId),
      recordExport,
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type":
          format === "json"
            ? "application/json; charset=utf-8"
            : "text/csv; charset=utf-8",
        ...(format === "csv"
          ? {
              "Content-Disposition": `attachment; filename="cases-${today}.csv"`,
            }
          : {}),
      },
    });
  } catch (error) {
    return internalError("导出失败", {
      request,
      error,
      event: "export.prepare_failed",
      context: { userId: authResult.userId },
    });
  }
}
