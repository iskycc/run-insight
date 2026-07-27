import {
  authenticateRequest,
  getTokenFromCookies,
  getCookieName,
  createTokenCookie,
  createLogoutCookie,
  generateToken,
} from "@/lib/auth";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new URL(url, "http://localhost:3000"),
    options as ConstructorParameters<typeof NextRequest>[1],
  );
}

function authCookie(): string {
  const token = generateToken({ userId: "user_1", username: "admin" });
  return `run_insight_token=${token}`;
}

describe("authenticateRequest", () => {
  it("should return 401 when no cookie header", async () => {
    const req = createRequest("/api/test");
    const result = await authenticateRequest(req);
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  it("should return 401 when token is invalid", async () => {
    const req = createRequest("/api/test");
    req.headers.set("cookie", "run_insight_token=invalid.token.value");
    const result = await authenticateRequest(req);
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  it("should return token payload for valid token", async () => {
    const req = createRequest("/api/test");
    req.headers.set("cookie", authCookie());
    const result = await authenticateRequest(req);
    expect(result).not.toBeInstanceOf(Response);
    const payload = result as { userId: string; username: string };
    expect(payload.userId).toBe("user_1");
    expect(payload.username).toBe("admin");
  });
});

describe("getTokenFromCookies", () => {
  it("should return null for null header", () => {
    expect(getTokenFromCookies(null)).toBeNull();
  });

  it("should return null when no matching cookie", () => {
    expect(getTokenFromCookies("other_cookie=abc")).toBeNull();
  });

  it("should return token from valid cookie", () => {
    expect(getTokenFromCookies("run_insight_token=abc123")).toBe("abc123");
  });

  it("should handle cookie with extra spaces", () => {
    expect(getTokenFromCookies("  run_insight_token=abc123  ")).toBe("abc123");
  });

  it("should handle cookie value containing = signs", () => {
    expect(getTokenFromCookies("run_insight_token=abc=def=ghi")).toBe(
      "abc=def=ghi"
    );
  });
});

describe("getCookieName", () => {
  it("should return 'run_insight_token'", () => {
    expect(getCookieName()).toBe("run_insight_token");
  });
});

describe("createTokenCookie", () => {
  it("should contain the token", () => {
    const cookie = createTokenCookie("my-token-value");
    expect(cookie).toContain("run_insight_token=my-token-value");
  });

  it("should contain HttpOnly", () => {
    const cookie = createTokenCookie("tok");
    expect(cookie).toContain("HttpOnly");
  });

  it("should contain Path=/", () => {
    const cookie = createTokenCookie("tok");
    expect(cookie).toContain("Path=/");
  });

  it("should contain SameSite=Lax", () => {
    const cookie = createTokenCookie("tok");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("should contain Max-Age", () => {
    const cookie = createTokenCookie("tok");
    expect(cookie).toMatch(/Max-Age=\d+/);
  });
});

describe("createLogoutCookie", () => {
  it("should contain Max-Age=0", () => {
    const cookie = createLogoutCookie();
    expect(cookie).toContain("Max-Age=0");
  });

  it("should contain HttpOnly", () => {
    const cookie = createLogoutCookie();
    expect(cookie).toContain("HttpOnly");
  });
});

describe("cookie secure flag", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalCookieSecure = process.env.COOKIE_SECURE;

  beforeEach(() => {
    delete process.env.COOKIE_SECURE;
  });

  afterEach(() => {
    Object.assign(process.env, { NODE_ENV: originalEnv });
    if (originalCookieSecure === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = originalCookieSecure;
    }
  });

  it("createTokenCookie includes Secure in production", () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    const cookie = createTokenCookie("test-token");
    expect(cookie).toContain("Secure");
  });

  it("createTokenCookie does not include Secure in development", () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    const cookie = createTokenCookie("test-token");
    expect(cookie).not.toContain("Secure");
  });

  it("createLogoutCookie includes Secure in production", () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    const cookie = createLogoutCookie();
    expect(cookie).toContain("Secure");
  });

  it("createLogoutCookie does not include Secure in development", () => {
    Object.assign(process.env, { NODE_ENV: "development" });
    const cookie = createLogoutCookie();
    expect(cookie).not.toContain("Secure");
  });

  it("allows an explicit insecure cookie override in production", () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      COOKIE_SECURE: "false",
    });

    expect(createTokenCookie("test-token")).not.toContain("Secure");
    expect(createLogoutCookie()).not.toContain("Secure");
  });

  it("allows Secure cookies to be forced outside production", () => {
    Object.assign(process.env, {
      NODE_ENV: "development",
      COOKIE_SECURE: "true",
    });

    expect(createTokenCookie("test-token")).toContain("Secure");
    expect(createLogoutCookie()).toContain("Secure");
  });
});
