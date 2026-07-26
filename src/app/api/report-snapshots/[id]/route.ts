import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await context.params;
    const snapshot = await prisma.reportSnapshot.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        scheduledReport: {
          select: {
            id: true,
            ownerId: true,
            cadence: true,
            timezone: true,
          },
        },
      },
    });
    if (!snapshot) return jsonError("NOT_FOUND", "报表快照不存在", 404);
    const access = await getProjectAccess(
      prisma,
      auth.userId,
      snapshot.projectId,
    );
    if (!access?.canView) {
      return jsonError("FORBIDDEN", "无权查看该报表快照", 403);
    }
    await prisma.reportNotification.updateMany({
      where: {
        snapshotId: snapshot.id,
        userId: auth.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ snapshot });
  } catch {
    return internalError("获取报表快照失败");
  }
}
