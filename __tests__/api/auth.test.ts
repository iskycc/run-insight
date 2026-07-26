import { POST as loginHandler } from "@/app/api/auth/login/route";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { prisma } from "@/lib/prisma";
import { generateToken, hashPassword, verifyToken } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/rate-limiter";
import { NextRequest, NextResponse } from "next/server";

// Mock prisma
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));
jest.mock("@/lib/rate-limiter", () => ({
  checkLoginRateLimit: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new URL(url, "http://localhost:3000"),
    options as ConstructorParameters<typeof NextRequest>[1],
  );
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkLoginRateLimit as jest.Mock).mockResolvedValue(null);
    (mockPrisma.session.create as jest.Mock).mockResolvedValue({
      id: "session_1",
    });
  });

  it("should return 400 if username or password is missing", async () => {
    const req = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(400);
    expect(checkLoginRateLimit).not.toHaveBeenCalled();
  });

  it("applies account-and-source limiting before looking up the user", async () => {
    (checkLoginRateLimit as jest.Mock).mockResolvedValue(
      NextResponse.json(
        { error: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" },
        { status: 429, headers: { "Retry-After": "12" } },
      ),
    );
    const req = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "  Admin  ", password: "guess" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await loginHandler(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("12");
    expect(checkLoginRateLimit).toHaveBeenCalledWith(req, "  Admin  ");
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("should return 401 if user not found", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "nonexistent", password: "pass" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(401);
  });

  it("should return 401 if password is wrong", async () => {
    const hashed = await hashPassword("correct");
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user_1",
      username: "admin",
      password: hashed,
      createdAt: new Date(),
    });
    const req = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "wrong" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(401);
  });

  it("should return user and set cookie on successful login", async () => {
    const hashed = await hashPassword("admin123");
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user_1",
      username: "admin",
      role: "ADMIN",
      password: hashed,
      createdAt: new Date("2026-01-01"),
    });
    const req = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "admin123" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("admin");
    expect(body.user.role).toBe("ADMIN");
    expect(res.headers.get("set-cookie")).toContain("run_insight_token=");
    const token = res.headers
      .get("set-cookie")
      ?.match(/run_insight_token=([^;]+)/)?.[1];
    expect(token).toBeDefined();
    expect(verifyToken(token ?? "")).toEqual(
      expect.objectContaining({
        userId: "user_1",
        sessionId: "session_1",
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        action: "LOGIN",
        entityType: "session",
        entityId: "session_1",
      }),
    });
    expect(mockPrisma.session.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        deviceInfo: "未知设备",
        expiresAt: expect.any(Date),
      },
      select: { id: true },
    });
  });

  it("should return 500 on internal error", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));
    const req = createRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "admin123" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/auth/logout", () => {
  it("should clear the auth cookie", async () => {
    const req = createRequest("/api/auth/logout", { method: "POST" });
    const res = await logoutHandler(req);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("writes a logout event for an authenticated session", async () => {
    const token = generateToken({ userId: "user_1", username: "admin" });
    const req = createRequest("/api/auth/logout", { method: "POST" });
    req.headers.set("cookie", `run_insight_token=${token}`);

    const res = await logoutHandler(req);

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        action: "LOGOUT",
        entityType: "session",
        entityId: "user_1",
      }),
    });
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return null user if no cookie", async () => {
    const req = createRequest("/api/auth/me");
    const res = await meHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });

  it("should return user if valid token in cookie", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user_1",
      username: "admin",
      createdAt: new Date("2026-01-01"),
    });
    // Generate a valid token
    const token = generateToken({ userId: "user_1", username: "admin" });
    const req = createRequest("/api/auth/me");
    req.headers.set("cookie", `run_insight_token=${token}`);
    const res = await meHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("admin");
  });

  it("should return null user if user not found in DB", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const token = generateToken({ userId: "user_999", username: "ghost" });
    const req = createRequest("/api/auth/me");
    req.headers.set("cookie", `run_insight_token=${token}`);
    const res = await meHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });

  it("should return null user on token verification error", async () => {
    // Use an invalid token that will cause verifyToken to throw
    const req = createRequest("/api/auth/me");
    req.headers.set("cookie", "run_insight_token=invalid-token-value");
    const res = await meHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });
});
