import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });
    if (!user) return jsonError("UNAUTHORIZED", "用户不存在", 401);

    const where = {
      userId: auth.userId,
      readAt: null,
      ...(user.role === "ADMIN"
        ? {}
        : { project: { members: { some: { userId: auth.userId } } } }),
    };
    const readAt = new Date();
    const [caseResult, reportResult] = await Promise.all([
      prisma.notification.updateMany({ where, data: { readAt } }),
      prisma.reportNotification?.updateMany
        ? prisma.reportNotification.updateMany({ where, data: { readAt } })
        : Promise.resolve({ count: 0 }),
    ]);
    return NextResponse.json({ updated: caseResult.count + reportResult.count });
  } catch {
    return internalError("标记全部通知失败");
  }
}
