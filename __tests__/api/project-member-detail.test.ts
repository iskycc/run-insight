import { NextRequest, NextResponse } from "next/server";
import {
  DELETE,
  PATCH,
} from "@/app/api/projects/[id]/members/[memberId]/route";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/project-access", () => ({ getProjectAccess: jest.fn() }));
jest.mock("@/lib/audit", () => ({ writeAuditLog: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: (() => {
    const projectMember = {
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    return {
      projectMember,
      $transaction: jest.fn(
        async (
          callback: (tx: { projectMember: typeof projectMember }) => Promise<unknown>,
        ) => callback({ projectMember }),
      ),
    };
  })(),
}));

const routeParams = {
  params: Promise.resolve({ id: "p1", memberId: "m1" }),
};

function patchRequest(role: string) {
  return new NextRequest("http://localhost/api/projects/p1/members/m1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

describe("/api/projects/[id]/members/[memberId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({
      userId: "u1",
      username: "admin",
    });
    (getProjectAccess as jest.Mock).mockResolvedValue({ canAdmin: true });
  });

  it("protects the last project administrator inside a serializable transaction", async () => {
    (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "ADMIN",
    });
    (prisma.projectMember.count as jest.Mock).mockResolvedValue(1);

    const response = await PATCH(patchRequest("EDITOR"), routeParams);

    expect(response.status).toBe(409);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(prisma.projectMember.update).not.toHaveBeenCalled();
  });

  it("protects the last project administrator from deletion", async () => {
    (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      role: "ADMIN",
    });
    (prisma.projectMember.count as jest.Mock).mockResolvedValue(1);

    const request = new NextRequest(
      "http://localhost/api/projects/p1/members/m1",
      { method: "DELETE" },
    );
    const response = await DELETE(request, routeParams);

    expect(response.status).toBe(409);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(prisma.projectMember.delete).not.toHaveBeenCalled();
  });

  it("deletes an administrator when another administrator remains", async () => {
    (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "ADMIN",
    });
    (prisma.projectMember.count as jest.Mock).mockResolvedValue(2);
    (prisma.projectMember.delete as jest.Mock).mockResolvedValue({ id: "m1" });

    const request = new NextRequest(
      "http://localhost/api/projects/p1/members/m1",
      { method: "DELETE" },
    );
    const response = await DELETE(request, routeParams);

    expect(response.status).toBe(200);
    expect(prisma.projectMember.delete).toHaveBeenCalledWith({
      where: { id: "m1" },
    });
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: "u1",
      action: "DELETE",
      entityType: "member",
      entityId: "m1",
      changes: { projectId: "p1", memberUserId: "u2", role: "ADMIN" },
    });
  });

  it.each([PATCH, DELETE])("passes through authentication failures", async (handler) => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 }),
    );
    const request = new NextRequest(
      "http://localhost/api/projects/p1/members/m1",
      {
        method: handler === PATCH ? "PATCH" : "DELETE",
        body: handler === PATCH ? JSON.stringify({ role: "EDITOR" }) : undefined,
      },
    );

    expect((await handler(request, routeParams)).status).toBe(401);
  });

  it.each([PATCH, DELETE])("denies non-project-admin member changes", async (handler) => {
    (getProjectAccess as jest.Mock).mockResolvedValue(null);
    const request = new NextRequest(
      "http://localhost/api/projects/p1/members/m1",
      {
        method: handler === PATCH ? "PATCH" : "DELETE",
        body: handler === PATCH ? JSON.stringify({ role: "EDITOR" }) : undefined,
      },
    );

    expect((await handler(request, routeParams)).status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid replacement role", async () => {
    const response = await PATCH(patchRequest("OWNER"), routeParams);

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([PATCH, DELETE])("returns 404 for a member outside the project", async (handler) => {
    (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);
    const request = new NextRequest(
      "http://localhost/api/projects/p1/members/missing",
      {
        method: handler === PATCH ? "PATCH" : "DELETE",
        body: handler === PATCH ? JSON.stringify({ role: "EDITOR" }) : undefined,
      },
    );

    expect((await handler(request, routeParams)).status).toBe(404);
  });

  it("updates a regular member and serializes the response", async () => {
    (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "VIEWER",
    });
    (prisma.projectMember.update as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "EDITOR",
      createdAt: new Date("2026-07-25T00:00:00Z"),
      user: { username: "bob", role: "EDITOR" },
    });

    const response = await PATCH(patchRequest("EDITOR"), routeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.member).toEqual({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      username: "bob",
      systemRole: "EDITOR",
      role: "EDITOR",
      createdAt: "2026-07-25T00:00:00.000Z",
    });
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: "u1",
      action: "UPDATE",
      entityType: "member",
      entityId: "m1",
      changes: { projectId: "p1", memberUserId: "u2", role: "EDITOR" },
    });
  });

  it("keeps an existing administrator without counting administrators", async () => {
    (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "ADMIN",
    });
    (prisma.projectMember.update as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "ADMIN",
      createdAt: new Date(),
      user: { username: "bob", role: "EDITOR" },
    });

    expect((await PATCH(patchRequest("ADMIN"), routeParams)).status).toBe(200);
    expect(prisma.projectMember.count).not.toHaveBeenCalled();
  });

  it("deletes a non-admin member without counting administrators", async () => {
    (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      userId: "u2",
      role: "VIEWER",
    });
    const request = new NextRequest(
      "http://localhost/api/projects/p1/members/m1",
      { method: "DELETE" },
    );

    expect((await DELETE(request, routeParams)).status).toBe(200);
    expect(prisma.projectMember.count).not.toHaveBeenCalled();
  });

  it.each([PATCH, DELETE])("maps transaction failures from %s to 500", async (handler) => {
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error("serialization"));
    const request = new NextRequest(
      "http://localhost/api/projects/p1/members/m1",
      {
        method: handler === PATCH ? "PATCH" : "DELETE",
        body: handler === PATCH ? JSON.stringify({ role: "EDITOR" }) : undefined,
      },
    );

    expect((await handler(request, routeParams)).status).toBe(500);
  });
});
