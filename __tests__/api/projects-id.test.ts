import { PATCH, DELETE } from "@/app/api/projects/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    project: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.requireActual("@/lib/auth").requireRole,
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), options as RequestInit);
}

function authCookie(): string {
  return "run_insight_token=dummy";
}

describe("PATCH /api/projects/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("should return 401 without auth", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );
    const req = createRequest("/api/projects/p1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("should return 404 when project does not exist", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/projects/p1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(404);
  });

  it("should update archived flag", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    (mockPrisma.project.update as jest.Mock).mockResolvedValue({
      id: "p1",
      name: "Project-1",
      archived: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });

    const req = createRequest("/api/projects/p1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.archived).toBe(true);
  });

  it("should handle empty body", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    (mockPrisma.project.update as jest.Mock).mockResolvedValue({
      id: "p1",
      name: "Project-1",
      archived: false,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });

    const req = createRequest("/api/projects/p1", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/projects/p1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/projects/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("should return 401 without auth", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );
    const req = createRequest("/api/projects/p1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("should return 403 for non-admin users", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    const req = createRequest("/api/projects/p1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(403);
  });

  it("should return 404 when project does not exist", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/projects/p1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(404);
  });

  it("should delete project and write audit log", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    (mockPrisma.project.delete as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const req = createRequest("/api/projects/p1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/projects/p1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(500);
  });
});
