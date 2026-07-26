import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { internalError, jsonError } from "@/lib/api-helpers";
import { processDueScheduledReports } from "@/lib/report-processor";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest, expected: string) {
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.headers.get("x-cron-secret");
  if (!provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonError("SERVICE_UNAVAILABLE", "定时报表任务尚未配置", 503);
  }
  if (!isAuthorized(request, secret)) {
    return jsonError("UNAUTHORIZED", "无权执行定时报表任务", 401);
  }
  try {
    return NextResponse.json(await processDueScheduledReports());
  } catch {
    return internalError("执行定时报表任务失败");
  }
}
