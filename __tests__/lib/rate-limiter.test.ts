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
  checkRateLimit,
  getClientIp,
  loginRateLimiter,
} from "@/lib/rate-limiter";

describe("rate limiter", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, { NODE_ENV: originalEnv });
  });

  it("getClientIp prefers x-forwarded-for", () => {
    const req = new NextRequest(new URL("http://localhost/api/login"), {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("getClientIp falls back to x-real-ip", () => {
    const req = new NextRequest(new URL("http://localhost/api/login"), {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("getClientIp returns unknown when no IP header is present", () => {
    const req = new NextRequest(new URL("http://localhost/api/login"));
    expect(getClientIp(req)).toBe("unknown");
  });

  it("returns null in test environment without consuming", async () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    const result = await checkRateLimit(loginRateLimiter, "1.2.3.4");
    expect(result).toBeNull();
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("allows requests when points are available", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    consumeMock.mockResolvedValue(undefined);

    const result = await checkRateLimit(loginRateLimiter, "1.2.3.4");
    expect(result).toBeNull();
    expect(consumeMock).toHaveBeenCalledWith("1.2.3.4");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    consumeMock.mockRejectedValue(new RateLimiterResMock());

    const result = await checkRateLimit(loginRateLimiter, "1.2.3.4");
    expect(result?.status).toBe(429);
    const body = await result!.json();
    expect(body.error).toBe("RATE_LIMITED");
  });

  it("allows requests on unexpected limiter errors", async () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    consumeMock.mockRejectedValue(new Error("Limiter failure"));

    const result = await checkRateLimit(loginRateLimiter, "1.2.3.4");
    expect(result).toBeNull();
  });
});
