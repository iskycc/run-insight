import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError } from "@/lib/api-helpers";
import type { AuditLogsResponse, AuditLogDTO } from "@/types";

function toAuditLogDTO(log: {
  id: string; userId: string; action: string; entityType: string;
  entityId: string; changes: unknown; createdAt: Date;
}): AuditLogDTO {
  return {
    id: log.id, userId: log.userId, action: log.action,
    entityType: log.entityType, entityId: log.entityId,
    changes: log.changes, createdAt: log.createdAt.toISOString(),
  };
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
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

    const where: Record<string, unknown> = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json<AuditLogsResponse>({
      logs: logs.map(toAuditLogDTO),
      total, page, pageSize,
    });
  } catch {
    return internalError("获取审计日志失败");
  }
}