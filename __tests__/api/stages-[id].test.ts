import { PATCH, DELETE } from "@/app/api/stages/[id]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    projectMember: { findUnique: jest.fn() },
    testStage: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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

describe("PATCH /api/stages/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("returns 401 without auth", async () => {
    const req = createRequest("/api/stages/s1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 if stage not found", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/stages/s1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(404);
  });

  it("archives a stage and returns it", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({ id: "s1" });
    (mockPrisma.testStage.update as jest.Mock).mockResolvedValue({
      id: "s1",
      name: "SIT-1",
      archived: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });

    const req = createRequest("/api/stages/s1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(true);
  });

  it("returns 500 on database error", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));
    const req = createRequest("/api/stages/s1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/stages/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("returns 401 without auth", async () => {
    const req = createRequest("/api/stages/s1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is insufficient", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/stages/s1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 if stage not found", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/stages/s1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(404);
  });

  it("deletes a stage and writes an audit log", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({ id: "s1" });
    (mockPrisma.testStage.delete as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const req = createRequest("/api/stages/s1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 500 on database error", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));
    const req = createRequest("/api/stages/s1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(500);
  });
});
