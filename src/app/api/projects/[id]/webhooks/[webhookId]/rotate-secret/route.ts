import { NextRequest, NextResponse } from "next/server";
import { internalError, jsonError } from "@/lib/api-helpers";
import { authenticateRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import {
  createWebhookSecret,
  encryptWebhookSecret,
  WebhookConfigurationError,
} from "@/lib/webhooks";

export async function POST(
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
      return jsonError("FORBIDDEN", "无权管理该项目的 Webhook", 403);
    }
    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, projectId: id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return jsonError("NOT_FOUND", "Webhook 不存在", 404);

    const secret = createWebhookSecret();
    await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: {
        secretCiphertext: encryptWebhookSecret(secret),
        secretPrefix: secret.slice(0, 12),
      },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "WEBHOOK_SECRET_ROTATE",
      entityType: "webhook",
      entityId: webhookId,
      changes: { projectId: id },
    });
    return NextResponse.json({ secret });
  } catch (error) {
    if (error instanceof WebhookConfigurationError) {
      return jsonError("SERVICE_UNAVAILABLE", error.message, 503);
    }
    return internalError("轮换 Webhook 密钥失败", {
      request,
      error,
      event: "webhook.secret_rotate_failed",
      context: { userId: auth.userId },
    });
  }
}
