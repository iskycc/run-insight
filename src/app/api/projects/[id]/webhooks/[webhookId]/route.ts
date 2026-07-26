import { NextRequest, NextResponse } from "next/server";
import { internalError, jsonError, parseJsonObject } from "@/lib/api-helpers";
import { authenticateRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import {
  parseWebhookEvents,
  parseWebhookUrl,
  serializeWebhookEndpoint,
} from "@/lib/webhooks";

async function canAdmin(userId: string, projectId: string) {
  const access = await getProjectAccess(prisma, userId, projectId);
  return access?.canAdmin === true;
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, webhookId } = await params;
    if (!(await canAdmin(auth.userId, id))) {
      return jsonError("FORBIDDEN", "无权管理该项目的 Webhook", 403);
    }
    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, projectId: id, deletedAt: null },
    });
    if (!existing) return jsonError("NOT_FOUND", "Webhook 不存在", 404);

    const parsed = await parseJsonObject(request, ["url", "active", "events"]);
    if (!parsed.ok) return parsed.response;
    if (Object.keys(parsed.value).length === 0) {
      return jsonError("VALIDATION_ERROR", "至少提供一个需要更新的字段");
    }
    const url =
      parsed.value.url === undefined
        ? null
        : parseWebhookUrl(parsed.value.url);
    if (url && !url.ok) return jsonError("VALIDATION_ERROR", url.message);
    const events =
      parsed.value.events === undefined
        ? null
        : parseWebhookEvents(parsed.value.events);
    if (events && !events.ok) {
      return jsonError("VALIDATION_ERROR", events.message);
    }
    if (
      parsed.value.active !== undefined &&
      typeof parsed.value.active !== "boolean"
    ) {
      return jsonError("VALIDATION_ERROR", "启用状态必须为布尔值");
    }

    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: {
        ...(url?.ok ? { url: url.value } : {}),
        ...(events?.ok ? { events: events.value } : {}),
        ...(typeof parsed.value.active === "boolean"
          ? { active: parsed.value.active }
          : {}),
      },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "WEBHOOK_UPDATE",
      entityType: "webhook",
      entityId: webhookId,
      changes: {
        projectId: id,
        ...(url?.ok ? { url: url.value } : {}),
        ...(events?.ok ? { events: events.value } : {}),
        ...(typeof parsed.value.active === "boolean"
          ? { active: parsed.value.active }
          : {}),
      },
    });
    return NextResponse.json({ webhook: serializeWebhookEndpoint(endpoint) });
  } catch (error) {
    return internalError("更新 Webhook 失败", {
      request,
      error,
      event: "webhook.update_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, webhookId } = await params;
    if (!(await canAdmin(auth.userId, id))) {
      return jsonError("FORBIDDEN", "无权管理该项目的 Webhook", 403);
    }
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, projectId: id, deletedAt: null },
      select: { id: true, url: true },
    });
    if (!endpoint) return jsonError("NOT_FOUND", "Webhook 不存在", 404);

    const deletedAt = new Date();
    await prisma.$transaction([
      prisma.webhookEndpoint.update({
        where: { id: webhookId },
        data: { active: false, deletedAt },
      }),
      prisma.webhookDelivery.updateMany({
        where: {
          endpointId: webhookId,
          status: { in: ["PENDING", "FAILED"] },
        },
        data: {
          status: "FAILED",
          nextAttemptAt: null,
          errorCode: "ENDPOINT_DELETED",
        },
      }),
    ]);
    await writeAuditLog({
      userId: auth.userId,
      action: "WEBHOOK_DELETE",
      entityType: "webhook",
      entityId: webhookId,
      changes: { projectId: id, url: endpoint.url },
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return internalError("删除 Webhook 失败", {
      request,
      error,
      event: "webhook.delete_failed",
      context: { userId: auth.userId },
    });
  }
}
