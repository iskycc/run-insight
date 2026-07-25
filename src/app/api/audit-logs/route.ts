import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { AuditLogsResponse, AuditLogDTO } from "@/types";

const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE"] as const;
const ENTITY_TYPES = [
  "project",
  "stage",
  "batch",
  "case",
  "user",
  "member",
  "apiKey",
  "asset",
  "rootCauseCategory",
] as const;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    action: log.action,
    entityType: log.entityType,
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
  return { CREATE: "创建", UPDATE: "更新", DELETE: "删除" }[action] ?? action;
}

function entityTypeLabel(entityType: string): string {
  return {
    project: "项目",
    stage: "测试阶段",
    batch: "批次",
    case: "用例",
    user: "用户",
    member: "项目成员",
    apiKey: "API Key",
    asset: "知识资产",
    rootCauseCategory: "根因分类",
  }[entityType] ?? entityType;
}

function toCsv(logs: AuditLogRecord[]): string {
  const header = ["时间", "用户", "用户 ID", "动作", "实体类型", "实体 ID", "变更详情"];
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.user.username,
    log.userId,
    actionLabel(log.action),
    entityTypeLabel(log.entityType),
    log.entityId,
    log.changes,
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { searchParams } = new URL(request.url);
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
    if (entityType && !ENTITY_TYPES.some((item) => item === entityType)) {
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

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

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
      const logs = await prisma.auditLog.findMany({
        where,
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
      });
      return new NextResponse(toCsv(logs), {
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
  } catch {
    return internalError("获取审计日志失败");
  }
}
