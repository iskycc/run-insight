import { GET, POST } from "@/app/api/users/route";
import { PATCH } from "@/app/api/users/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.requireActual("@/lib/auth").requireRole,
  hashPassword: jest.fn().mockResolvedValue("hashed"),
}));

describe("User management API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
  });

  it("should list users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" }); // for requireRole
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: "u1", username: "admin", role: "ADMIN", createdAt: new Date(), updatedAt: new Date() },
    ]);
    const req = { url: "http://localhost/api/users", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
  });

  it("should create user", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" }) // requireRole check
      .mockResolvedValueOnce(null); // duplicate check
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: "u2", username: "newuser", role: "EDITOR", createdAt: new Date(), updatedAt: new Date() });

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser", password: "pass123", role: "EDITOR" }),
    } as unknown as Request;
    const res = await POST(req as any);
    expect(res.status).toBe(201);
  });

  it("should update user role", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" }) // auth check
      .mockResolvedValueOnce({ id: "u2", role: "EDITOR" }); // target exists
    (prisma.user.update as jest.Mock).mockResolvedValue({ id: "u2", username: "editor", role: "VIEWER", createdAt: new Date(), updatedAt: new Date() });

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "VIEWER" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(200);
  });

  it("should return 403 for non-admin users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });

    const req = { url: "http://localhost/api/users", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(403);
  });

  it("should return 401 when listing users without auth", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = { url: "http://localhost/api/users", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("should return 401 when creating user without auth", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser", password: "pass123", role: "EDITOR" }),
    } as unknown as Request;
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("should return 401 when updating user without auth", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "VIEWER" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(401);
  });

  it("should return 500 when listing users fails", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (prisma.user.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = { url: "http://localhost/api/users", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(500);
  });

  it("should return 400 when creating user with missing fields", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser" }),
    } as unknown as Request;
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("should return 409 when username already exists", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ id: "u2", username: "newuser" });

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser", password: "pass123", role: "EDITOR" }),
    } as unknown as Request;
    const res = await POST(req as any);
    expect(res.status).toBe(409);
  });

  it("should return 500 when creating user fails", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce(null);
    (prisma.user.create as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser", password: "pass123", role: "EDITOR" }),
    } as unknown as Request;
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });

  it("should return 400 when updating with invalid role", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "INVALID" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(400);
  });

  it("should return 404 when updating non-existent user", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce(null);

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "VIEWER" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(404);
  });

  it("should return 500 when updating user fails", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ id: "u2", role: "EDITOR" });
    (prisma.user.update as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "VIEWER" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(500);
  });

  it("should return 401 for POST when not authenticated", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser", password: "pass123", role: "EDITOR" }),
    } as unknown as Request;
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("should return 401 for PATCH when not authenticated", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "VIEWER" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(401);
  });
});