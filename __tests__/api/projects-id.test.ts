import { PATCH, DELETE } from "@/app/api/projects/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
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
  return new NextRequest(
    new URL(url, "http://localhost:3000"),
    options as ConstructorParameters<typeof NextRequest>[1],
  );
}

function authCookie(): string {
  return "run_insight_token=dummy";
}

describe("PATCH /api/projects/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (mockPrisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "OWNER" });
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      organizationId: "o1",
      name: "Project-1",
      archived: false,
    });
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

  it("should reject an empty body", async () => {
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
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message: "归档状态必须为布尔值",
    });
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
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
    (mockPrisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "OWNER" });
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      organizationId: "o1",
      name: "Project-1",
      archived: false,
    });
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
    (mockPrisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "MEMBER" });
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

  it("moves an active project to trash without physically deleting it", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      name: "Project-1",
      archived: false,
    });
    (mockPrisma.project.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const req = createRequest("/api/projects/p1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(body).toEqual({
      deleted: true,
      archived: true,
      permanent: false,
    });
    expect(mockPrisma.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { archived: true },
    });
    expect(mockPrisma.project.delete).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ARCHIVE" }),
    });
  });

  it("allows a project editor to move an active project to trash", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "MEMBER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      name: "Project-1",
      archived: false,
    });

    const req = createRequest("/api/projects/p1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { archived: true },
    });
    expect(mockPrisma.project.delete).not.toHaveBeenCalled();
  });

  it("rejects permanent deletion of an active project", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      name: "Project-1",
      archived: false,
    });
    const req = createRequest("/api/projects/p1?permanent=true", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(409);
    expect(mockPrisma.project.delete).not.toHaveBeenCalled();
  });

  it("permanently deletes an archived project for a project admin", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      name: "Project-1",
      archived: true,
    });
    const req = createRequest("/api/projects/p1?permanent=true", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true, permanent: true });
    expect(mockPrisma.project.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "DELETE" }),
    });
  });

  it("rejects permanent deletion by a project editor", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "MEMBER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    const req = createRequest("/api/projects/p1?permanent=true", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(403);
    expect(mockPrisma.project.delete).not.toHaveBeenCalled();
  });

  it("rejects an invalid permanent query parameter", async () => {
    const req = createRequest("/api/projects/p1?permanent=yes", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message: "查询参数 permanent 必须为 true 或 false",
    });
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
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
