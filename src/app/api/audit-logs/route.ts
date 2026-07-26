import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseRequestUrl,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_TYPES,
  AUDIT_ENTITY_TYPE_LABELS,
} from "@/types";
import type {
  AuditAction,
  AuditEntityType,
  AuditLogsResponse,
  AuditLogDTO,
} from "@/types";
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AUDIT_EXPORT_BATCH_SIZE = 500;

interface AuditLogRecord {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: unknown;
  createdAt: Date;
  user: { username: string };
}

function toAuditLogDTO(log: AuditLogRecord): AuditLogDTO {
  return {
    id: log.id,
    userId: log.userId,
    username: log.user.username,
    action: log.action as AuditAction,
    entityType: log.entityType as AuditEntityType,
    entityId: log.entityId,
    changes: log.changes,
    createdAt: log.createdAt.toISOString(),
  };
}

function parseDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function endOfDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function csvCell(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) {
    text = "";
  } else if (typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }

  // Prevent spreadsheet applications from evaluating user-controlled cells.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function actionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}

function entityTypeLabel(entityType: string): string {
  return AUDIT_ENTITY_TYPE_LABELS[entityType as AuditEntityType] ?? entityType;
}

const AUDIT_CSV_HEADER = [
  "时间",
  "用户",
  "用户 ID",
  "动作",
  "实体类型",
  "实体 ID",
  "变更详情",
]
  .map(csvCell)
  .join(",");

function auditCsvBatch(logs: AuditLogRecord[]): string {
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.user.username,
    log.userId,
    actionLabel(log.action),
    entityTypeLabel(log.entityType),
    log.entityId,
    log.changes,
  ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function createAuditExportStream({
  initialLogs,
  signal,
  fetchNext,
  recordExport,
}: {
  initialLogs: AuditLogRecord[];
  signal?: AbortSignal;
  fetchNext: (cursorId: string) => Promise<AuditLogRecord[]>;
  recordExport: (rowCount: number, cancelled: boolean) => Promise<void>;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let logs = initialLogs;
  let emittedRows = 0;
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
        controller.enqueue(encoder.encode(`\uFEFF${AUDIT_CSV_HEADER}\r\n`));
      },
      async pull(controller) {
        if (cancelled) {
          await finalize(true);
          if (!consumerCancelled) controller.close();
          return;
        }

        try {
          if (logs.length === 0) {
            await finalize(false);
            if (consumerCancelled) return;
            controller.close();
            return;
          }

          const currentLogs = logs;
          logs = [];
          emittedRows += currentLogs.length;
          controller.enqueue(
            encoder.encode(`${auditCsvBatch(currentLogs)}\r\n`),
          );

          if (currentLogs.length < AUDIT_EXPORT_BATCH_SIZE) {
            await finalize(false);
            if (consumerCancelled) return;
            controller.close();
            return;
          }

          const nextLogs = await fetchNext(currentLogs[currentLogs.length - 1].id);
          if (cancelled) {
            await finalize(true);
            if (!consumerCancelled) controller.close();
            return;
          }
          logs = nextLogs;
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

function parsePositiveInteger(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const parsedUrl = parseRequestUrl(request);
    if (!parsedUrl.ok) return parsedUrl.response;
    const { searchParams } = parsedUrl.value;
    const entityType = searchParams.get("entityType") || undefined;
    const entityId = searchParams.get("entityId") || undefined;
    const userId = searchParams.get("userId") || undefined;
    const action = searchParams.get("action") || undefined;
    const dateFromValue = searchParams.get("dateFrom") || undefined;
    const dateToValue = searchParams.get("dateTo") || undefined;
    const format = searchParams.get("format") || undefined;

    if (action && !AUDIT_ACTIONS.some((item) => item === action)) {
      return jsonError("VALIDATION_ERROR", "动作筛选条件不合法");
    }
    if (entityType && !AUDIT_ENTITY_TYPES.some((item) => item === entityType)) {
      return jsonError("VALIDATION_ERROR", "实体类型筛选条件不合法");
    }
    if (userId && !SAFE_ID_PATTERN.test(userId)) {
      return jsonError("VALIDATION_ERROR", "用户 ID 筛选条件不合法");
    }
    if (entityId && !SAFE_ID_PATTERN.test(entityId)) {
      return jsonError("VALIDATION_ERROR", "实体 ID 筛选条件不合法");
    }
    if (format && format !== "csv") {
      return jsonError("VALIDATION_ERROR", "导出格式不合法");
    }

    const dateFrom = dateFromValue ? parseDate(dateFromValue) : undefined;
    const dateTo = dateToValue ? parseDate(dateToValue) : undefined;
    if ((dateFromValue && !dateFrom) || (dateToValue && !dateTo)) {
      return jsonError("VALIDATION_ERROR", "日期格式不合法，请使用 YYYY-MM-DD");
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return jsonError("VALIDATION_ERROR", "开始日期不能晚于结束日期");
    }

    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const requestedPageSize = parsePositiveInteger(searchParams.get("pageSize"), 20);
    if (page === null || requestedPageSize === null || requestedPageSize > 100) {
      return jsonError("VALIDATION_ERROR", "分页参数不合法");
    }
    const pageSize = requestedPageSize;

    const where: Record<string, unknown> = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: endOfDay(dateTo) } : {}),
      };
    }

    if (format === "csv") {
      const findLogs = (cursorId?: string) =>
        prisma.auditLog.findMany({
          where,
          include: { user: { select: { username: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: AUDIT_EXPORT_BATCH_SIZE,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        });
      const initialLogs = await findLogs();
      const recordExport = async (rowCount: number, cancelled: boolean) => {
        await writeAuditLog({
          userId: authResult.userId,
          action: "EXPORT",
          entityType: "auditLog",
          entityId: "csv",
          changes: {
            filters: {
              action,
              entityType,
              entityId,
              userId,
              dateFrom: dateFromValue,
              dateTo: dateToValue,
            },
            rowCount,
            ...(cancelled ? { cancelled: true } : {}),
          },
        });
      };
      const stream = createAuditExportStream({
        initialLogs,
        signal: request.signal,
        fetchNext: (cursorId) => findLogs(cursorId),
        recordExport,
      });
      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json<AuditLogsResponse>({
      logs: logs.map(toAuditLogDTO),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    return internalError("获取审计日志失败", {
      request,
      error,
      event: "audit_log.query_failed",
      context: { userId: authResult.userId },
    });
  }
}
