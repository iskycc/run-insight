import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { logger } from "@/lib/logger";
import type { ApiError } from "@/types";

export const loginRateLimiter = new RateLimiterMemory({
  keyPrefix: "login-source-account",
  points: 10,
  duration: 60,
});

export const loginAccountRateLimiter = new RateLimiterMemory({
  keyPrefix: "login-account",
  points: 30,
  duration: 5 * 60,
});

export const importRateLimiter = new RateLimiterMemory({
  keyPrefix: "import",
  points: 30,
  duration: 60,
});

export const setupRateLimiter = new RateLimiterMemory({
  keyPrefix: "instance-setup",
  points: 5,
  duration: 60,
});

function trustedProxyHops(): number {
  const configured = process.env.TRUST_PROXY_HOPS?.trim();
  if (!configured || !/^\d+$/.test(configured)) return 0;
  const hops = Number(configured);
  return Number.isSafeInteger(hops) && hops > 0 ? hops : 0;
}

function normalizeIp(value: string): string | null {
  const candidate = value.trim();
  if (isIP(candidate)) return candidate.toLowerCase();

  const bracketed = candidate.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed && isIP(bracketed[1])) {
    return bracketed[1].toLowerCase();
  }

  const ipv4WithPort = candidate.match(/^([^:]+):\d+$/);
  if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4) {
    return ipv4WithPort[1];
  }
  return null;
}

export function getClientIp(request: NextRequest): string {
  const hops = trustedProxyHops();
  if (hops === 0) {
    return "untrusted-source";
  }

  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (forwarded && forwarded.length >= hops) {
    const clientIp = normalizeIp(forwarded[forwarded.length - hops]);
    if (clientIp) return clientIp;
  }

  if (hops === 1) {
    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
      const clientIp = normalizeIp(realIp);
      if (clientIp) return clientIp;
    }
  }

  return "untrusted-source";
}

export function normalizeRateLimitUsername(username: string): string {
  const normalized = username.normalize("NFKC").trim().toLowerCase();
  return normalized.slice(0, 128) || "empty";
}

export function getIdentityRateLimitKey(
  identity: string,
  request: NextRequest,
): string {
  return `identity:${encodeURIComponent(identity)}|source:${getClientIp(request)}`;
}

function rateLimitResponse(retryAfterSeconds: number): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    { error: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
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
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((rej.msBeforeNext || 1000) / 1000),
      );
      return rateLimitResponse(retryAfterSeconds);
    }
    // Allow the request on unexpected limiter errors.
    logger.error("rate_limit.limiter_failure", {
      error: rej,
      safeErrorMessage:
        "Unexpected in-memory limiter failure; request allowed",
    });
    return null;
  }
}

export async function checkLoginRateLimit(
  request: NextRequest,
  username: string,
): Promise<NextResponse<ApiError> | null> {
  const normalizedUsername = normalizeRateLimitUsername(username);
  const sourceAndAccount = getIdentityRateLimitKey(
    `login:${normalizedUsername}`,
    request,
  );
  const sourceLimit = await checkRateLimit(loginRateLimiter, sourceAndAccount);
  if (sourceLimit) return sourceLimit;

  return checkRateLimit(
    loginAccountRateLimiter,
    `account:${encodeURIComponent(normalizedUsername)}`,
  );
}

export function checkImportRateLimit(
  request: NextRequest,
  userId: string,
): Promise<NextResponse<ApiError> | null> {
  return checkRateLimit(
    importRateLimiter,
    getIdentityRateLimitKey(`import:${userId}`, request),
  );
}

export function checkSetupRateLimit(
  request: NextRequest,
): Promise<NextResponse<ApiError> | null> {
  return checkRateLimit(
    setupRateLimiter,
    getIdentityRateLimitKey("instance-setup", request),
  );
}
