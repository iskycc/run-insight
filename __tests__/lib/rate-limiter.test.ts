import { NextRequest } from "next/server";

const consumeMock = jest.fn();
const RateLimiterResMock = jest.fn();

jest.mock("rate-limiter-flexible", () => ({
  RateLimiterMemory: jest.fn().mockImplementation(() => ({
    consume: consumeMock,
  })),
  RateLimiterRes: RateLimiterResMock,
}));

import {
  checkImportRateLimit,
  checkLoginRateLimit,
  checkRateLimit,
  checkSetupRateLimit,
  getClientIp,
  getIdentityRateLimitKey,
  loginRateLimiter,
  normalizeRateLimitUsername,
} from "@/lib/rate-limiter";

function request(headers?: Record<string, string>) {
  return new NextRequest(new URL("http://localhost/api/login"), { headers });
}

describe("rate limiter", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTrustProxyHops = process.env.TRUST_PROXY_HOPS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TRUST_PROXY_HOPS;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    }
    else Object.assign(process.env, { NODE_ENV: originalNodeEnv });
    if (originalTrustProxyHops === undefined) {
      delete process.env.TRUST_PROXY_HOPS;
    } else {
      process.env.TRUST_PROXY_HOPS = originalTrustProxyHops;
    }
  });

  it("does not trust forwarding headers without explicit proxy configuration", () => {
    const req = request({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "9.9.9.9",
    });

    expect(getClientIp(req)).toBe("untrusted-source");
  });

  it("selects the client from the right side of a trusted proxy chain", () => {
    process.env.TRUST_PROXY_HOPS = "2";
    const req = request({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.9.9.9",
    });

    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("ignores spoofed left entries with a single trusted proxy", () => {
    process.env.TRUST_PROXY_HOPS = "1";
    const req = request({
      "x-forwarded-for": "198.51.100.9, 203.0.113.8",
    });

    expect(getClientIp(req)).toBe("203.0.113.8");
  });

  it("accepts x-real-ip only for one explicitly trusted proxy", () => {
    process.env.TRUST_PROXY_HOPS = "1";
    expect(getClientIp(request({ "x-real-ip": "9.9.9.9:443" }))).toBe(
      "9.9.9.9",
    );

    process.env.TRUST_PROXY_HOPS = "2";
    expect(getClientIp(request({ "x-real-ip": "9.9.9.9" }))).toBe(
      "untrusted-source",
    );
  });

  it("falls back safely for invalid config, short chains, or malformed IPs", () => {
    process.env.TRUST_PROXY_HOPS = "invalid";
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4" }))).toBe(
      "untrusted-source",
    );

    process.env.TRUST_PROXY_HOPS = "2";
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4" }))).toBe(
      "untrusted-source",
    );

    process.env.TRUST_PROXY_HOPS = "1";
    expect(getClientIp(request({ "x-forwarded-for": "not-an-ip" }))).toBe(
      "untrusted-source",
    );
  });

  it("normalizes usernames and creates identity-scoped keys", () => {
    process.env.TRUST_PROXY_HOPS = "1";
    const req = request({ "x-forwarded-for": "[2001:db8::1]:443" });

    expect(normalizeRateLimitUsername("  ＡdMiN  ")).toBe("admin");
    expect(normalizeRateLimitUsername("   ")).toBe("empty");
    expect(normalizeRateLimitUsername("x".repeat(200))).toHaveLength(128);
    expect(getIdentityRateLimitKey("user:1", req)).toBe(
      "identity:user%3A1|source:2001:db8::1",
    );
  });

  it("returns null in test environment without consuming", async () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    const result = await checkRateLimit(loginRateLimiter, "key");
    expect(result).toBeNull();
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("allows requests when points are available", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    consumeMock.mockResolvedValue(undefined);

    const result = await checkRateLimit(loginRateLimiter, "key");
    expect(result).toBeNull();
    expect(consumeMock).toHaveBeenCalledWith("key");
  });

  it("returns 429 with Retry-After when rate limit is exceeded", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    const rejection = Object.assign(new RateLimiterResMock(), {
      msBeforeNext: 2_500,
    });
    consumeMock.mockRejectedValue(rejection);

    const result = await checkRateLimit(loginRateLimiter, "key");
    expect(result?.status).toBe(429);
    expect(result?.headers.get("Retry-After")).toBe("3");
    expect((await result!.json()).error).toBe("RATE_LIMITED");
  });

  it("records unexpected limiter errors without logging secrets", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    consumeMock.mockRejectedValue(new Error("secret limiter detail"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const result = await checkRateLimit(loginRateLimiter, "sensitive-key");

    expect(result).toBeNull();
    const record = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(record).toEqual(
      expect.objectContaining({
        level: "error",
        event: "rate_limit.limiter_failure",
        requestId: expect.any(String),
        error: expect.objectContaining({
          name: "Error",
          message:
            "Unexpected in-memory limiter failure; request allowed",
        }),
      }),
    );
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("sensitive-key");
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("secret");
    consoleSpy.mockRestore();
  });

  it("limits login by normalized account plus source and by account globally", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.TRUST_PROXY_HOPS = "1";
    consumeMock.mockResolvedValue(undefined);

    const result = await checkLoginRateLimit(
      request({ "x-forwarded-for": "203.0.113.8" }),
      "  ＡdMiN  ",
    );

    expect(result).toBeNull();
    expect(consumeMock).toHaveBeenNthCalledWith(
      1,
      "identity:login%3Aadmin|source:203.0.113.8",
    );
    expect(consumeMock).toHaveBeenNthCalledWith(2, "account:admin");
  });

  it("stops after the source-account login limit rejects", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    consumeMock.mockRejectedValue(
      Object.assign(new RateLimiterResMock(), { msBeforeNext: 1_000 }),
    );

    const result = await checkLoginRateLimit(request(), "admin");

    expect(result?.status).toBe(429);
    expect(consumeMock).toHaveBeenCalledTimes(1);
  });

  it("scopes import limits to the authenticated user and source", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.TRUST_PROXY_HOPS = "1";
    consumeMock.mockResolvedValue(undefined);

    const result = await checkImportRateLimit(
      request({ "x-forwarded-for": "203.0.113.9" }),
      "user-1",
    );

    expect(result).toBeNull();
    expect(consumeMock).toHaveBeenCalledWith(
      "identity:import%3Auser-1|source:203.0.113.9",
    );
  });

  it("limits first-run initialization by source", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.TRUST_PROXY_HOPS = "1";
    consumeMock.mockResolvedValue(undefined);

    const result = await checkSetupRateLimit(
      request({ "x-forwarded-for": "203.0.113.10" }),
    );

    expect(result).toBeNull();
    expect(consumeMock).toHaveBeenCalledWith(
      "identity:instance-setup|source:203.0.113.10",
    );
  });
});
