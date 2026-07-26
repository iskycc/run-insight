import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest, secret: string): boolean {
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.headers.get("x-cron-secret");
  if (!provided) return false;

  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonError("SERVICE_UNAVAILABLE", "催办任务尚未配置", 503);
  }
  if (!isAuthorized(request, secret)) {
    return jsonError("UNAUTHORIZED", "无权执行催办任务", 401);
  }

  try {
    const now = new Date();
    const maximumDueDate = new Date(now.getTime() + 168 * 60 * 60 * 1000);
    const candidates = await prisma.caseResult.findMany({
      where: {
        assigneeId: { not: null },
        dueDate: { lte: maximumDueDate },
        project: { archived: false },
        stage: { archived: false },
        batchScope: { archived: false },
        OR: [
          { progressCategory: null },
          { progressCategory: { notIn: ["FIXED", "NOT_ISSUE"] } },
        ],
      },
      select: {
        id: true,
        projectId: true,
        assigneeId: true,
        dueDate: true,
        assigneeUser: {
          select: {
            notificationPreference: {
              select: {
                dueSoonEnabled: true,
                overdueEnabled: true,
                dueSoonHours: true,
              },
            },
          },
        },
      },
    });

    const notifications = candidates.flatMap((candidate) => {
      if (!candidate.assigneeId || !candidate.dueDate) return [];
      const preference = candidate.assigneeUser?.notificationPreference;
      const overdue = candidate.dueDate.getTime() <= now.getTime();
      if (overdue && preference?.overdueEnabled === false) return [];
      if (!overdue) {
        if (preference?.dueSoonEnabled === false) return [];
        const dueSoonHours = preference?.dueSoonHours ?? 48;
        const threshold = now.getTime() + dueSoonHours * 60 * 60 * 1000;
        if (candidate.dueDate.getTime() > threshold) return [];
      }

      const type = overdue ? ("OVERDUE" as const) : ("DUE_SOON" as const);
      return [
        {
          userId: candidate.assigneeId,
          actorId: null,
          projectId: candidate.projectId,
          caseResultId: candidate.id,
          type,
          dedupeKey: [
            "due",
            type,
            candidate.id,
            candidate.assigneeId,
            candidate.dueDate.getTime(),
          ].join(":"),
        },
      ];
    });
    if (notifications.length === 0) {
      return NextResponse.json({ processed: candidates.length, created: 0 });
    }

    const result = await prisma.notification.createMany({
      data: notifications,
      skipDuplicates: true,
    });
    return NextResponse.json({
      processed: candidates.length,
      created: result.count,
    });
  } catch {
    return internalError("执行催办任务失败");
  }
}
