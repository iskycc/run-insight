import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { POST as runImport } from "@/app/api/import/route";
import type { Prisma } from "@/generated/prisma/client";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { secretsEqual } from "@/lib/secrets";
import { emitWebhookEvent } from "@/lib/webhooks";

export const runtime = "nodejs";
const STALE_MS = 10 * 60 * 1000;
const CLAIM_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!secretsEqual(secret, supplied)) {
    return jsonError("UNAUTHORIZED", "无权处理导入任务", 401);
  }

  try {
    const staleAt = new Date(Date.now() - STALE_MS);
    await prisma.importJob.updateMany({
      where: {
        cancelRequested: true,
        OR: [
          { status: "PENDING" },
          {
            status: "RUNNING",
            OR: [
              { heartbeatAt: null },
              { heartbeatAt: { lt: staleAt } },
            ],
          },
        ],
      },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });

    let candidate = null;
    let claimToken = "";
    let raced = false;
    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
      const next = await prisma.importJob.findFirst({
        where: {
          OR: [
            { status: "PENDING", cancelRequested: false },
            {
              status: "RUNNING",
              cancelRequested: false,
              OR: [
                { heartbeatAt: null },
                { heartbeatAt: { lt: staleAt } },
              ],
            },
          ],
        },
        orderBy: { createdAt: "asc" },
      });
      if (!next) break;

      const nextToken = randomUUID();
      const claimed = await prisma.importJob.updateMany({
        where: {
          id: next.id,
          status: next.status,
          claimToken: next.claimToken,
          cancelRequested: false,
        },
        data: {
          status: "RUNNING",
          claimToken: nextToken,
          claimedAt: new Date(),
          heartbeatAt: new Date(),
          startedAt: next.startedAt ?? new Date(),
          attempts: { increment: 1 },
        },
      });
      if (claimed.count) {
        candidate = next;
        claimToken = nextToken;
        break;
      }
      raced = true;
    }
    if (!candidate) return NextResponse.json({ processed: false, raced });

    const latest = await prisma.importJob.findUnique({
      where: { id: candidate.id },
    });
    if (!latest || latest.cancelRequested) {
      await prisma.importJob.updateMany({
        where: { id: candidate.id, claimToken, status: "RUNNING" },
        data: {
          status: "CANCELLED",
          cancelRequested: true,
          finishedAt: new Date(),
          progress: 0,
        },
      });
      return NextResponse.json({ processed: true, status: "CANCELLED" });
    }

    const response = await runImport(
      new NextRequest("http://internal/api/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-import-worker-secret": secret!,
          "x-import-owner-id": latest.ownerId,
        },
        body: JSON.stringify(latest.payload),
      }),
    );
    let body: Record<string, unknown> = {};
    try {
      const parsed = (await response.json()) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }

    const record = response.ok
      ? await prisma.importRecord.findUnique({
          where: { requestId: latest.requestId },
          select: { id: true },
        })
      : null;
    const details = Array.isArray(body.details)
      ? (body.details.slice(0, 10_000) as Prisma.InputJsonValue)
      : undefined;
    const finalized = await prisma.importJob.updateMany({
      where: { id: candidate.id, claimToken, status: "RUNNING" },
      data: response.ok
        ? {
            status: "SUCCEEDED",
            progress: 100,
            processedRows: latest.totalRows,
            importRecordId: record?.id,
            finishedAt: new Date(),
            heartbeatAt: new Date(),
          }
        : {
            status: "FAILED",
            errorSummary:
              typeof body.message === "string"
                ? body.message.slice(0, 1000)
                : "导入失败",
            errorDetails: details,
            errorCount: Array.isArray(body.details) ? body.details.length : 1,
            finishedAt: new Date(),
            heartbeatAt: new Date(),
          },
    });
    if (!finalized.count) {
      return NextResponse.json({ processed: false, superseded: true });
    }
    if (!response.ok) {
      await emitWebhookEvent({
        projectId: latest.projectId,
        event: "IMPORT_FAILED",
        data: {
          importJobId: latest.id,
          requestId: latest.requestId,
          reason:
            typeof body.error === "string" ? body.error : "IMPORT_FAILED",
        },
      });
    }
    return NextResponse.json({
      processed: true,
      status: response.ok ? "SUCCEEDED" : "FAILED",
    });
  } catch (error) {
    return internalError("处理导入任务失败", { request, error });
  }
}
