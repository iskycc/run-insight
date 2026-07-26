import { NextRequest, NextResponse } from "next/server";
import { internalError, jsonError } from "@/lib/api-helpers";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { serializeWebhookDelivery } from "@/lib/webhooks";
import type { WebhookDeliveriesResponse } from "@/types";

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, webhookId } = await params;
    const access = await getProjectAccess(prisma, auth.userId, id);
    if (!access?.canAdmin) {
      return jsonError("FORBIDDEN", "无权查看 Webhook 投递记录", 403);
    }
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, projectId: id, deletedAt: null },
      select: { id: true },
    });
    if (!endpoint) return jsonError("NOT_FOUND", "Webhook 不存在", 404);

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { endpointId: webhookId, projectId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json<WebhookDeliveriesResponse>({
      deliveries: deliveries.map(serializeWebhookDelivery),
    });
  } catch (error) {
    return internalError("获取 Webhook 投递记录失败", {
      request,
      error,
      event: "webhook.delivery_list_failed",
      context: { userId: auth.userId },
    });
  }
}
