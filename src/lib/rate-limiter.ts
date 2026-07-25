import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import type { ApiError } from "@/types";

export const loginRateLimiter = new RateLimiterMemory({
  keyPrefix: "login",
  points: 10,
  duration: 60,
});

export const importRateLimiter = new RateLimiterMemory({
  keyPrefix: "import",
  points: 30,
  duration: 60,
});

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function rateLimitResponse(): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    { error: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" },
    { status: 429 }
  );
}

export async function checkRateLimit(
  limiter: RateLimiterMemory,
  key: string
): Promise<NextResponse<ApiError> | null> {
  // Disable rate limiting in tests to avoid shared-state flakiness.
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  try {
    await limiter.consume(key);
    return null;
  } catch (rej) {
    if (rej instanceof RateLimiterRes) {
      return rateLimitResponse();
    }
    // Allow the request on unexpected limiter errors.
    return null;
  }
}
