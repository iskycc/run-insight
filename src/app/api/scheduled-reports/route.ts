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

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const reports = await prisma.scheduledReport.findMany({
      where: { ownerId: auth.userId },
      include: {
        project: { select: { id: true, name: true, archived: true } },
        snapshots: {
          select: { id: true, generatedAt: true },
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return NextResponse.json({ reports });
  } catch {
    return internalError("获取定时报表失败");
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsed = validateScheduledReportInput(await request.json());
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
      return jsonError("FORBIDDEN", "无权为该项目创建报表", 403);
    }
    if (project.archived) {
      return jsonError("CONFLICT", "已归档项目不能创建定时报表", 409);
    }
    const configScopeError = await validateReportConfigScope(
      parsed.value.projectId,
      parsed.value.type,
      parsed.value.config,
    );
    if (configScopeError) {
      return jsonError("VALIDATION_ERROR", configScopeError);
    }

    const nextRunAt = getNextRunAt(parsed.value);
    const report = await prisma.scheduledReport.create({
      data: {
        ...parsed.value,
        config: parsed.value.config as Prisma.InputJsonValue,
        ownerId: auth.userId,
        nextRunAt,
      },
      include: {
        project: { select: { id: true, name: true, archived: true } },
      },
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError("VALIDATION_ERROR", "请求体不是有效 JSON");
    }
    return internalError("创建定时报表失败");
  }
}
