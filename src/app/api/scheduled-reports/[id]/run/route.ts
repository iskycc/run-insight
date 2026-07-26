import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { runScheduledReportNow } from "@/lib/report-processor";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await context.params;
    const report = await prisma.scheduledReport.findFirst({
      where: { id, ownerId: auth.userId },
      select: { projectId: true },
    });
    if (!report) return jsonError("NOT_FOUND", "定时报表不存在", 404);
    const access = await getProjectAccess(
      prisma,
      auth.userId,
      report.projectId,
    );
    if (!access?.canView) {
      return jsonError("FORBIDDEN", "无权生成该项目的报表", 403);
    }
    const snapshot = await runScheduledReportNow(id, auth.userId);
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("NOT_FOUND", "定时报表不存在", 404);
    }
    if (error instanceof Error && error.message === "PROJECT_ARCHIVED") {
      return jsonError("CONFLICT", "已归档项目不能生成报表", 409);
    }
    return internalError("立即生成报表失败");
  }
}
