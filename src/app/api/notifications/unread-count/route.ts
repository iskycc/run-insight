import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
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
    const [caseCount, reportCount] = await Promise.all([
      prisma.notification.count({
        where,
      }),
      prisma.reportNotification?.count
        ? prisma.reportNotification.count({
            where,
          })
        : Promise.resolve(0),
    ]);
    return NextResponse.json({ count: caseCount + reportCount });
  } catch {
    return internalError("获取未读通知数失败");
  }
}
