import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/validations";

async function getOwnedNotification(
  id: string,
  userId: string,
): Promise<
  | { error: NextResponse; notification?: never }
  | { error?: never; notification: { id: string; projectId: string } }
> {
  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, userId: true, projectId: true },
  });
  if (!notification || notification.userId !== userId) {
    return { error: jsonError("NOT_FOUND", "通知不存在", 404) };
  }
  const access = await getProjectAccess(prisma, userId, notification.projectId);
  if (!access?.canView) {
    return { error: jsonError("FORBIDDEN", "无权访问该通知所属项目", 403) };
  }
  return { notification };
}

async function getOwnedReportNotification(id: string, userId: string) {
  const notification = await prisma.reportNotification.findUnique({
    where: { id },
    select: { id: true, userId: true, projectId: true },
  });
  if (!notification || notification.userId !== userId) {
    return { error: jsonError("NOT_FOUND", "通知不存在", 404) };
  }
  const access = await getProjectAccess(prisma, userId, notification.projectId);
  if (!access?.canView) {
    return { error: jsonError("FORBIDDEN", "无权访问该通知所属项目", 403) };
  }
  return { notification };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (id.startsWith("report:")) {
      const reportId = id.slice("report:".length);
      if (!isValidCuid(reportId)) {
        return jsonError("VALIDATION_ERROR", "无效的通知ID");
      }
      const owned = await getOwnedReportNotification(reportId, auth.userId);
      if (owned.error) return owned.error;
      await prisma.reportNotification.update({
        where: { id: reportId },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }
    if (!isValidCuid(id)) return jsonError("VALIDATION_ERROR", "无效的通知ID");
    const owned = await getOwnedNotification(id, auth.userId);
    if (owned.error) return owned.error;

    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch {
    return internalError("标记通知失败");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (id.startsWith("report:")) {
      const reportId = id.slice("report:".length);
      if (!isValidCuid(reportId)) {
        return jsonError("VALIDATION_ERROR", "无效的通知ID");
      }
      const owned = await getOwnedReportNotification(reportId, auth.userId);
      if (owned.error) return owned.error;
      await prisma.reportNotification.delete({ where: { id: reportId } });
      return NextResponse.json({ success: true });
    }
    if (!isValidCuid(id)) return jsonError("VALIDATION_ERROR", "无效的通知ID");
    const owned = await getOwnedNotification(id, auth.userId);
    if (owned.error) return owned.error;

    await prisma.notification.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return internalError("删除通知失败");
  }
}
