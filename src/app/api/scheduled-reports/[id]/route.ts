import type { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import {
  getNextRunAt,
  validateReportConfigScope,
  validateScheduledReportInput,
} from "@/lib/scheduled-reports";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await context.params;
    const report = await prisma.scheduledReport.findFirst({
      where: { id, ownerId: auth.userId },
      include: {
        project: { select: { id: true, name: true, archived: true } },
        snapshots: {
          select: {
            id: true,
            reportName: true,
            reportType: true,
            generatedAt: true,
            periodKey: true,
          },
          orderBy: { generatedAt: "desc" },
          take: 50,
        },
      },
    });
    if (!report) return jsonError("NOT_FOUND", "定时报表不存在", 404);
    return NextResponse.json({ report });
  } catch {
    return internalError("获取定时报表失败");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await context.params;
    const existing = await prisma.scheduledReport.findFirst({
      where: { id, ownerId: auth.userId },
    });
    if (!existing) return jsonError("NOT_FOUND", "定时报表不存在", 404);

    const parsed = validateScheduledReportInput(await request.json(), {
      name: existing.name,
      projectId: existing.projectId,
      type: existing.type,
      config: existing.config as Record<string, unknown>,
      cadence: existing.cadence,
      timezone: existing.timezone,
      runHour: existing.runHour,
      runMinute: existing.runMinute,
      weekDay: existing.weekDay,
      active: existing.active,
    });
    if (!parsed.ok) return jsonError("VALIDATION_ERROR", parsed.message);
    const project = await prisma.project.findUnique({
      where: { id: parsed.value.projectId },
      select: { id: true, archived: true },
    });
    if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
    const access = await getProjectAccess(
      prisma,
      auth.userId,
      parsed.value.projectId,
    );
    if (!access?.canView) {
      return jsonError("FORBIDDEN", "无权为该项目管理报表", 403);
    }
    if (project.archived && parsed.value.active) {
      return jsonError("CONFLICT", "已归档项目不能启用定时报表", 409);
    }
    const configScopeError = await validateReportConfigScope(
      parsed.value.projectId,
      parsed.value.type,
      parsed.value.config,
    );
    if (configScopeError) {
      return jsonError("VALIDATION_ERROR", configScopeError);
    }

    const nextRunAt = parsed.value.active
      ? getNextRunAt(parsed.value)
      : existing.nextRunAt;
    const report = await prisma.scheduledReport.update({
      where: { id },
      data: {
        ...parsed.value,
        config: parsed.value.config as Prisma.InputJsonValue,
        nextRunAt,
        claimToken: null,
        claimedAt: null,
      },
      include: {
        project: { select: { id: true, name: true, archived: true } },
      },
    });
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON");
    }
    return internalError("更新定时报表失败");
  }
}

// Deletion is intentionally a soft delete: immutable snapshots and their
// project audit trail stay available, while future executions stop.
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await context.params;
    const result = await prisma.scheduledReport.updateMany({
      where: { id, ownerId: auth.userId },
      data: {
        active: false,
        claimToken: null,
        claimedAt: null,
      },
    });
    if (result.count === 0) {
      return jsonError("NOT_FOUND", "定时报表不存在", 404);
    }
    return NextResponse.json({ success: true });
  } catch {
    return internalError("停用定时报表失败");
  }
}
