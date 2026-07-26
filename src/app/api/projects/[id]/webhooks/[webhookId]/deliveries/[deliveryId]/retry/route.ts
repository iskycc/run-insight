import { NextRequest, NextResponse } from "next/server";
import { internalError, jsonError } from "@/lib/api-helpers";
import { authenticateRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; webhookId: string; deliveryId: string }>;
  },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, webhookId, deliveryId } = await params;
    const access = await getProjectAccess(prisma, auth.userId, id);
    if (!access?.canAdmin) {
      return jsonError("FORBIDDEN", "无权重试 Webhook 投递", 403);
    }
    const delivery = await prisma.webhookDelivery.findFirst({
      where: {
        id: deliveryId,
        endpointId: webhookId,
        projectId: id,
      },
      include: {
        endpoint: { select: { active: true, deletedAt: true } },
      },
    });
    if (!delivery) return jsonError("NOT_FOUND", "Webhook 投递记录不存在", 404);
    if (!delivery.endpoint.active || delivery.endpoint.deletedAt) {
      return jsonError("CONFLICT", "Webhook 已停用或删除，无法重试", 409);
    }
    if (delivery.status === "PROCESSING") {
      return jsonError("CONFLICT", "Webhook 正在投递中", 409);
    }

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        claimToken: null,
        claimedAt: null,
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        deliveredAt: null,
      },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "WEBHOOK_RETRY",
      entityType: "webhookDelivery",
      entityId: deliveryId,
      changes: { projectId: id, webhookId },
    });
    return NextResponse.json({ queued: true });
  } catch (error) {
    return internalError("重试 Webhook 投递失败", {
      request,
      error,
      event: "webhook.delivery_retry_failed",
      context: { userId: auth.userId },
    });
  }
}
