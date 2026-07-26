import { NextRequest, NextResponse } from "next/server";
import { getPublicBuildInfo } from "@/lib/build-info";
import { logger, requestIdFrom } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DATABASE_CHECK_TIMEOUT_MS = 2_000;

async function checkDatabaseReady(): Promise<
  { ready: true } | { ready: false; error: unknown }
> {
  let timeoutId!: ReturnType<typeof setTimeout>;

  try {
    await Promise.race([
      prisma.$queryRawUnsafe("SELECT 1"),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Database readiness check timed out")),
          DATABASE_CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    return { ready: true };
  } catch (error) {
    return { ready: false, error };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request?: NextRequest) {
  const databaseCheck = await checkDatabaseReady();
  const databaseReady = databaseCheck.ready;
  const requestId = requestIdFrom(request);
  if (!databaseCheck.ready) {
    logger.warn("health.readiness_failed", {
      requestId,
      context: { check: "database" },
      error: databaseCheck.error,
      safeErrorMessage: "Database readiness check failed",
    });
  }
  const responseBody = {
    status: databaseReady ? "ready" : "not_ready",
    check: "readiness",
    ...getPublicBuildInfo(),
    checks: {
      database: databaseReady ? "up" : "down",
    },
    timestamp: new Date().toISOString(),
    ...(databaseReady
      ? {}
      : {
          error: "SERVICE_UNAVAILABLE",
          message: "数据库暂不可用",
        }),
  };

  const response = NextResponse.json(
    responseBody,
    {
      status: databaseReady ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
  response.headers.set("x-request-id", requestId);
  return response;
}
