import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseOptionalBooleanSearchParam,
  parseRequestUrl,
} from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import type { NotificationDTO, NotificationsResponse } from "@/types";

function toNotificationDTO(notification: {
  id: string;
  type: NotificationDTO["type"];
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; username: string } | null;
  project: { id: string; name: string };
  caseResult: { id: string; caseNo: string; name: string };
}): NotificationDTO {
  return {
    id: notification.id,
    type: notification.type,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    link: `/case/${encodeURIComponent(notification.caseResult.id)}`,
    actor: notification.actor,
    project: notification.project,
    case: notification.caseResult,
  };
}

function toReportNotificationDTO(notification: {
  id: string;
  readAt: Date | null;
  createdAt: Date;
  link: string;
  project: { id: string; name: string };
  snapshot: { id: string; reportName: string };
}): NotificationDTO {
  return {
    id: `report:${notification.id}`,
    type: "REPORT_GENERATED",
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    link: notification.link,
    actor: null,
    project: notification.project,
    case: {
      id: notification.snapshot.id,
      caseNo: "报表快照",
      name: notification.snapshot.reportName,
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsedUrl = parseRequestUrl(request);
    if (!parsedUrl.ok) return parsedUrl.response;
    const unread = parseOptionalBooleanSearchParam(
      parsedUrl.value.searchParams,
      "unread",
    );
    if (!unread.ok) return unread.response;

    const page = Math.max(
      1,
      Number(parsedUrl.value.searchParams.get("page")) || 1,
    );
    const pageSize = Math.min(
      50,
      Math.max(
        1,
        Number(parsedUrl.value.searchParams.get("pageSize")) || 20,
      ),
    );
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });
    if (!user) return jsonError("UNAUTHORIZED", "用户不存在", 401);

    const where: Prisma.NotificationWhereInput = {
      userId: auth.userId,
      ...(unread.value ? { readAt: null } : {}),
      ...(user.role === "ADMIN"
        ? {}
        : { project: { members: { some: { userId: auth.userId } } } }),
    };
    const skip = (page - 1) * pageSize;
    const reportClient = prisma.reportNotification;
    const reportWhere = {
      userId: auth.userId,
      ...(unread.value ? { readAt: null } : {}),
      ...(user.role === "ADMIN"
        ? {}
        : { project: { members: { some: { userId: auth.userId } } } }),
    };
    const [notifications, notificationTotal, reportNotifications, reportTotal] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          actor: { select: { id: true, username: true } },
          project: { select: { id: true, name: true } },
          caseResult: { select: { id: true, caseNo: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: skip + pageSize,
      }),
      prisma.notification.count({ where }),
      reportClient?.findMany
        ? reportClient.findMany({
            where: reportWhere,
            include: {
              project: { select: { id: true, name: true } },
              snapshot: { select: { id: true, reportName: true } },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: skip + pageSize,
          })
        : Promise.resolve([]),
      reportClient?.count ? reportClient.count({ where: reportWhere }) : Promise.resolve(0),
    ]);
    const merged = [
      ...notifications.map(toNotificationDTO),
      ...reportNotifications.map(toReportNotificationDTO),
    ]
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
          || right.id.localeCompare(left.id),
      )
      .slice(skip, skip + pageSize);

    return NextResponse.json<NotificationsResponse>({
      notifications: merged,
      total: notificationTotal + reportTotal,
      page,
      pageSize,
    });
  } catch {
    return internalError("获取通知列表失败");
  }
}
