import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { internalError, jsonError } from "@/lib/api-helpers";
import { logger, requestIdFrom } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { secretsEqual } from "@/lib/secrets";
import {
  decryptWebhookSecret,
  sendSignedWebhook,
  WEBHOOK_MAX_ATTEMPTS,
  webhookRetryDelayMs,
  type WebhookEnvelope,
} from "@/lib/webhooks";

export const runtime = "nodejs";

const STALE_CLAIM_MS = 10 * 60 * 1000;
const CLAIM_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const supplied = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!secretsEqual(process.env.CRON_SECRET, supplied)) {
    return jsonError("UNAUTHORIZED", "无权处理 Webhook 投递", 401);
  }

  try {
    const now = new Date();
    const staleAt = new Date(now.getTime() - STALE_CLAIM_MS);
    await prisma.webhookDelivery.updateMany({
      where: { status: "PROCESSING", claimedAt: { lt: staleAt } },
      data: {
        status: "FAILED",
        claimToken: null,
        claimedAt: null,
        nextAttemptAt: now,
        errorCode: "STALE_CLAIM",
      },
    });

    let deliveryId: string | null = null;
    let claimToken = "";
    let raced = false;
    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
      const candidate = await prisma.webhookDelivery.findFirst({
        where: {
          status: { in: ["PENDING", "FAILED"] },
          nextAttemptAt: { lte: now },
          attempts: { lt: WEBHOOK_MAX_ATTEMPTS },
          endpoint: { active: true, deletedAt: null },
        },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        select: { id: true, status: true, attempts: true },
      });
      if (!candidate) break;

      const token = randomUUID();
      const claimed = await prisma.webhookDelivery.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          attempts: candidate.attempts,
          nextAttemptAt: { lte: now },
        },
        data: {
          status: "PROCESSING",
          claimToken: token,
          claimedAt: now,
          attempts: { increment: 1 },
        },
      });
      if (claimed.count === 1) {
        deliveryId = candidate.id;
        claimToken = token;
        break;
      }
      raced = true;
    }
    if (!deliveryId) {
      return NextResponse.json({ processed: false, raced });
    }

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, claimToken, status: "PROCESSING" },
      include: {
        endpoint: {
          select: {
            active: true,
            deletedAt: true,
            secretCiphertext: true,
          },
        },
      },
    });
    if (!delivery || !delivery.endpoint.active || delivery.endpoint.deletedAt) {
      await prisma.webhookDelivery.updateMany({
        where: { id: deliveryId, claimToken, status: "PROCESSING" },
        data: {
          status: "FAILED",
          claimToken: null,
          claimedAt: null,
          nextAttemptAt: null,
          errorCode: "ENDPOINT_UNAVAILABLE",
        },
      });
      return NextResponse.json({
        processed: true,
        status: "FAILED",
        terminal: true,
      });
    }

    let result;
    try {
      result = await sendSignedWebhook({
        url: delivery.targetUrl,
        secret: decryptWebhookSecret(delivery.endpoint.secretCiphertext),
        envelope: delivery.payload as unknown as WebhookEnvelope,
      });
    } catch {
      result = { ok: false as const, errorCode: "SECRET_UNAVAILABLE" };
    }
    const terminal = !result.ok && delivery.attempts >= delivery.maxAttempts;
    const nextAttemptAt =
      !result.ok && !terminal
        ? new Date(Date.now() + webhookRetryDelayMs(delivery.attempts))
        : null;
    const finalized = await prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, claimToken, status: "PROCESSING" },
      data: result.ok
        ? {
            status: "SUCCEEDED",
            claimToken: null,
            claimedAt: null,
            nextAttemptAt: null,
            responseStatus: result.responseStatus,
            responseBody: result.responseBody,
            errorCode: null,
            deliveredAt: new Date(),
          }
        : {
            status: "FAILED",
            claimToken: null,
            claimedAt: null,
            nextAttemptAt,
            responseStatus: result.responseStatus,
            responseBody: result.responseBody,
            errorCode: result.errorCode ?? "DELIVERY_FAILED",
          },
    });
    if (!finalized.count) {
      return NextResponse.json({ processed: false, superseded: true });
    }
    if (!result.ok) {
      logger.warn("webhook.delivery_failed", {
        requestId: requestIdFrom(request),
        context: {
          deliveryId,
          endpointId: delivery.endpointId,
          projectId: delivery.projectId,
          attempt: delivery.attempts,
          terminal,
          errorCode: result.errorCode ?? "DELIVERY_FAILED",
        },
        safeErrorMessage: "Webhook delivery failed",
      });
    }
    return NextResponse.json({
      processed: true,
      status: result.ok ? "SUCCEEDED" : "FAILED",
      terminal,
      nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
    });
  } catch (error) {
    return internalError("处理 Webhook 投递失败", {
      request,
      error,
      event: "webhook.worker_failed",
    });
  }
}
