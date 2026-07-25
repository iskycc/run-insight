import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/projects/[id]/members/route";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/project-access", () => ({ getProjectAccess: jest.fn() }));
jest.mock("@/lib/audit", () => ({ writeAuditLog: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    projectMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const params = Promise.resolve({ id: "p1" });

describe("/api/projects/[id]/members", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: true, canAdmin: true });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
  });

  it("returns members and management capability", async () => {
    (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);
    const response = await GET(new NextRequest("http://localhost/api/projects/p1/members"), { params });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ members: [], canManage: true });
  });

  it("adds an existing user with a project role", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u2",
      username: "bob",
      role: "EDITOR",
    });
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.projectMember.create as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "EDITOR",
      createdAt: new Date("2026-07-25T00:00:00Z"),
      user: { username: "bob", role: "EDITOR" },
    });
    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bob", role: "EDITOR" }),
    });

    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    expect(prisma.projectMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { projectId: "p1", userId: "u2", role: "EDITOR" },
    }));
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: "u1",
      action: "CREATE",
      entityType: "member",
      entityId: "m1",
      changes: { projectId: "p1", memberUserId: "u2", role: "EDITOR" },
    });
  });

  it("rejects member management by non-admin project members", async () => {
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: true, canAdmin: false });
    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bob", role: "EDITOR" }),
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it("maps concurrent duplicate memberships to a conflict response", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u2",
      username: "bob",
      role: "EDITOR",
    });
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const duplicateError = Object.assign(new Error("duplicate"), { code: "P2002" });
    (prisma.projectMember.create as jest.Mock).mockRejectedValue(duplicateError);

    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bob", role: "EDITOR" }),
    });
    const response = await POST(request, { params });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "CONFLICT",
      message: "用户已是项目成员",
    });
  });

  it.each([GET, POST])("passes through authentication failures", async (handler) => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 }),
    );
    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: handler === POST ? "POST" : "GET",
      body: handler === POST
        ? JSON.stringify({ userId: "u2", role: "EDITOR" })
        : undefined,
    });

    expect((await handler(request, { params })).status).toBe(401);
  });

  it.each([GET, POST])("returns 404 for a missing project", async (handler) => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: handler === POST ? "POST" : "GET",
      body: handler === POST
        ? JSON.stringify({ userId: "u2", role: "EDITOR" })
        : undefined,
    });

    expect((await handler(request, { params })).status).toBe(404);
  });

  it("denies listing members without project visibility", async () => {
    (getProjectAccess as jest.Mock).mockResolvedValue({
      canView: false,
      canAdmin: false,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/p1/members"),
      { params },
    );

    expect(response.status).toBe(403);
  });

  it("serializes member identity and roles", async () => {
    (prisma.projectMember.findMany as jest.Mock).mockResolvedValue([{
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "VIEWER",
      createdAt: new Date("2026-07-25T00:00:00Z"),
      user: { username: "bob", role: "EDITOR" },
    }]);

    const response = await GET(
      new NextRequest("http://localhost/api/projects/p1/members"),
      { params },
    );
    const body = await response.json();

    expect(body.members[0]).toEqual({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      username: "bob",
      systemRole: "EDITOR",
      role: "VIEWER",
      createdAt: "2026-07-25T00:00:00.000Z",
    });
  });

  it.each([
    [{ userId: "u2", role: "OWNER" }, "项目角色不合法"],
    [{ role: "EDITOR" }, "请选择用户"],
    [{ userId: "", username: "   ", role: "EDITOR" }, "请选择用户"],
  ])("validates member creation input %#", async (body, message) => {
    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const response = await POST(request, { params });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(message);
  });

  it("looks up a selected user ID and returns 404 when it is stale", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: "POST",
      body: JSON.stringify({ userId: "u2", role: "EDITOR" }),
    });

    const response = await POST(request, { params });

    expect(response.status).toBe(404);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u2" } });
  });

  it("returns conflict when the user is already a member", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "u2" });
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ id: "m1" });
    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: "POST",
      body: JSON.stringify({ userId: "u2", role: "EDITOR" }),
    });

    expect((await POST(request, { params })).status).toBe(409);
  });

  it.each([
    [GET, "findMany"],
    [POST, "findUnique"],
  ])("maps ordinary %s database errors to 500", async (handler, method) => {
    if (handler === GET) {
      (prisma.projectMember.findMany as jest.Mock).mockRejectedValue(new Error("DB"));
    } else {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error("DB"));
    }
    const request = new NextRequest("http://localhost/api/projects/p1/members", {
      method: handler === POST ? "POST" : "GET",
      body: handler === POST
        ? JSON.stringify({ userId: "u2", role: "EDITOR" })
        : undefined,
    });

    expect((await handler(request, { params })).status).toBe(500);
    expect(method).toBeDefined();
  });
});
