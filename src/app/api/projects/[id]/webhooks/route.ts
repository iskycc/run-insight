import { NextRequest, NextResponse } from "next/server";
import { internalError, jsonError, parseJsonObject } from "@/lib/api-helpers";
import { authenticateRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import {
  createWebhookSecret,
  encryptWebhookSecret,
  parseWebhookEvents,
  parseWebhookUrl,
  serializeWebhookEndpoint,
  WebhookConfigurationError,
} from "@/lib/webhooks";
import type {
  WebhookEndpointCreateResponse,
  WebhookEndpointsResponse,
} from "@/types";

async function requireWebhookAdmin(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, archived: true },
  });
  if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
  const access = await getProjectAccess(prisma, userId, projectId);
  if (!access?.canAdmin) {
    return jsonError("FORBIDDEN", "无权管理该项目的 Webhook", 403);
  }
  return project;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const access = await requireWebhookAdmin(auth.userId, id);
    if (access instanceof NextResponse) return access;
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json<WebhookEndpointsResponse>({
      webhooks: endpoints.map(serializeWebhookEndpoint),
    });
  } catch (error) {
    return internalError("获取 Webhook 失败", {
      request,
      error,
      event: "webhook.list_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const access = await requireWebhookAdmin(auth.userId, id);
    if (access instanceof NextResponse) return access;
    if (access.archived) {
      return jsonError("CONFLICT", "不能为已归档项目创建 Webhook", 409);
    }
    const parsed = await parseJsonObject(request, ["url", "active", "events"]);
    if (!parsed.ok) return parsed.response;
    const url = parseWebhookUrl(parsed.value.url);
    if (!url.ok) return jsonError("VALIDATION_ERROR", url.message);
    const events = parseWebhookEvents(parsed.value.events);
    if (!events.ok) return jsonError("VALIDATION_ERROR", events.message);
    if (
      parsed.value.active !== undefined &&
      typeof parsed.value.active !== "boolean"
    ) {
      return jsonError("VALIDATION_ERROR", "启用状态必须为布尔值");
    }

    const secret = createWebhookSecret();
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        projectId: id,
        url: url.value,
        active: parsed.value.active ?? true,
        events: events.value,
        secretCiphertext: encryptWebhookSecret(secret),
        secretPrefix: secret.slice(0, 12),
      },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "WEBHOOK_CREATE",
      entityType: "webhook",
      entityId: endpoint.id,
      changes: {
        projectId: id,
        url: endpoint.url,
        active: endpoint.active,
        events: events.value,
      },
    });

    return NextResponse.json<WebhookEndpointCreateResponse>(
      { webhook: serializeWebhookEndpoint(endpoint), secret },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof WebhookConfigurationError) {
      return jsonError("SERVICE_UNAVAILABLE", error.message, 503);
    }
    return internalError("创建 Webhook 失败", {
      request,
      error,
      event: "webhook.create_failed",
      context: { userId: auth.userId },
    });
  }
}
