import { GET, POST } from "@/app/api/users/route";
import { PATCH } from "@/app/api/users/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: (() => {
    const user = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    };
    const session = {
      updateMany: jest.fn(),
    };
    return {
      user,
      session,
      $transaction: jest.fn(async (
        callback: (tx: { user: typeof user; session: typeof session }) => Promise<unknown>,
      ) =>
        callback({ user, session })
      ),
    };
  })(),
}));
jest.mock("@/lib/auth", () => ({
  ...jest.requireActual("@/lib/auth"),
  authenticateRequest: jest.fn(),
  hashPassword: jest.fn().mockResolvedValue("hashed"),
}));
jest.mock("@/lib/audit", () => ({ writeAuditLog: jest.fn() }));

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
      json: async () => ({ username: "newuser", password: "pass1234", role: "EDITOR" }),
    } as unknown as Request;
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: "u1",
      action: "CREATE",
      entityType: "user",
      entityId: "u2",
      changes: { username: "newuser", role: "EDITOR" },
    });
    expect(writeAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ changes: expect.objectContaining({ password: expect.anything() }) })
    );
  });

  it("should update user role", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" }) // auth check
      .mockResolvedValueOnce({
        id: "u2",
        username: "editor",
        role: "EDITOR",
        authSource: "LOCAL",
      }); // target exists
    (prisma.user.update as jest.Mock).mockResolvedValue({
      id: "u2",
      username: "editor",
      role: "VIEWER",
      authSource: "LOCAL",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "VIEWER" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(200);
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: "u1",
      action: "UPDATE",
      entityType: "user",
      entityId: "u2",
      changes: {
        role: {
          from: "EDITOR",
          to: "VIEWER",
        },
      },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "u2", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("should forbid administrators from changing their own role", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });

    const req = {
      url: "http://localhost/api/users/u1",
      headers: new Headers(),
      json: async () => ({ role: "VIEWER" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u1" }) });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "FORBIDDEN",
      message: "不能修改自己的角色",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("should preserve the last administrator", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "u2",
        username: "admin2",
        role: "ADMIN",
        authSource: "LOCAL",
      });
    (prisma.user.count as jest.Mock).mockResolvedValue(1);

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "EDITOR" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "FORBIDDEN",
      message: "系统至少需要保留一个管理员",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("should allow demoting an administrator when another administrator remains", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "u2",
        username: "admin2",
        role: "ADMIN",
        authSource: "LOCAL",
      });
    (prisma.user.count as jest.Mock).mockResolvedValue(2);
    (prisma.user.update as jest.Mock).mockResolvedValue({
      id: "u2",
      username: "admin2",
      role: "EDITOR",
      authSource: "LOCAL",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "EDITOR" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });

    expect(res.status).toBe(200);
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { role: "ADMIN" } });
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

  it("should reject a new user password shorter than eight characters", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser", password: "short", role: "EDITOR" }),
    } as unknown as Request;
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "VALIDATION_ERROR",
      message: "密码长度必须为 8 到 128 个字符",
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("should return 400 when creating user with an invalid runtime role", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser", password: "pass1234", role: "OWNER" }),
    } as unknown as Request;
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "VALIDATION_ERROR",
      message: "角色不合法",
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("should return 409 when username already exists", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ id: "u2", username: "newuser" });

    const req = {
      url: "http://localhost/api/users",
      headers: new Headers(),
      json: async () => ({ username: "newuser", password: "pass1234", role: "EDITOR" }),
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
      json: async () => ({ username: "newuser", password: "pass1234", role: "EDITOR" }),
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
      .mockResolvedValueOnce({
        id: "u2",
        username: "editor",
        role: "EDITOR",
        authSource: "LOCAL",
      });
    (prisma.user.update as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ role: "VIEWER" }),
    } as unknown as Request;
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(500);
  });

  it("allows an administrator to change their own local username", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue({
      userId: "u1",
      username: "admin",
      sessionId: "session-current",
    });
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "u1",
        username: "admin",
        role: "ADMIN",
        authSource: "LOCAL",
      })
      .mockResolvedValueOnce(null);
    (prisma.user.update as jest.Mock).mockResolvedValue({
      id: "u1",
      username: "super-admin",
      role: "ADMIN",
      authSource: "LOCAL",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-02-01"),
    });
    const req = {
      url: "http://localhost/api/users/u1",
      headers: new Headers(),
      json: async () => ({ username: " super-admin " }),
    } as unknown as Request;

    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: "u1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        id: "u1",
        username: "super-admin",
        role: "ADMIN",
        authSource: "LOCAL",
      }),
    );
    expect(res.headers.get("set-cookie")).toContain("run_insight_token=");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { username: "super-admin" },
      }),
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        revokedAt: null,
        id: { not: "session-current" },
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: "u1",
      action: "UPDATE",
      entityType: "user",
      entityId: "u1",
      changes: {
        username: {
          from: "admin",
          to: "super-admin",
        },
      },
    });
  });

  it("rejects username changes for LDAP-managed users", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "u2",
        username: "directory-user",
        role: "EDITOR",
        authSource: "LDAP",
      });
    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ username: "renamed-user" }),
    } as unknown as Request;

    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: "u2" }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "FORBIDDEN",
      message: "LDAP 用户名由目录服务管理，不能在本系统中修改",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a username already used by another account", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "u2",
        username: "editor",
        role: "EDITOR",
        authSource: "LOCAL",
      })
      .mockResolvedValueOnce({ id: "u3" });
    const req = {
      url: "http://localhost/api/users/u2",
      headers: new Headers(),
      json: async () => ({ username: "existing-user" }),
    } as unknown as Request;

    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: "u2" }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "CONFLICT",
      message: "用户名已存在",
    });
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
