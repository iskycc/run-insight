import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/cases/[id]/activities/route";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/project-access", () => ({ getProjectAccess: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: { findUnique: jest.fn() },
    caseActivity: { findMany: jest.fn(), create: jest.fn() },
  },
}));

const validId = "clxxxxxxxxxxxxxxxxxxxxxx1";
const params = Promise.resolve({ id: validId });

describe("/api/cases/[id]/activities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "alice" });
    (prisma.caseResult.findUnique as jest.Mock).mockResolvedValue({ id: validId, projectId: "p1" });
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: true, canEdit: true });
  });

  it("returns a newest-first timeline", async () => {
    (prisma.caseActivity.findMany as jest.Mock).mockResolvedValue([{
      id: "a1",
      type: "COMMENT",
      changes: null,
      comment: "已复现",
      user: { id: "u1", username: "alice" },
      createdAt: new Date("2026-07-25T00:00:00Z"),
    }]);

    const response = await GET(new NextRequest(`http://localhost/api/cases/${validId}/activities`), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activities[0].comment).toBe("已复现");
    expect(prisma.caseActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: "desc" },
    }));
  });

  it("lets editors add a trimmed comment", async () => {
    (prisma.caseActivity.create as jest.Mock).mockResolvedValue({
      id: "a1",
      type: "COMMENT",
      changes: null,
      comment: "已复现",
      user: { id: "u1", username: "alice" },
      createdAt: new Date(),
    });
    const request = new NextRequest(`http://localhost/api/cases/${validId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "  已复现  " }),
    });

    const response = await POST(request, { params });

    expect(response.status).toBe(201);
    expect(prisma.caseActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ comment: "已复现", userId: "u1" }),
    }));
  });

  it("keeps project viewers read-only", async () => {
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: true, canEdit: false });
    const request = new NextRequest(`http://localhost/api/cases/${validId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "不能评论" }),
    });

    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it.each([GET, POST])("passes through authentication failures", async (handler) => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 }),
    );
    const request = new NextRequest(`http://localhost/api/cases/${validId}/activities`, {
      method: handler === POST ? "POST" : "GET",
      body: handler === POST ? JSON.stringify({ comment: "hello" }) : undefined,
    });

    expect((await handler(request, { params })).status).toBe(401);
  });

  it.each([GET, POST])("rejects an invalid case ID", async (handler) => {
    const request = new NextRequest("http://localhost/api/cases/bad/activities", {
      method: handler === POST ? "POST" : "GET",
      body: handler === POST ? JSON.stringify({ comment: "hello" }) : undefined,
    });

    const response = await handler(request, {
      params: Promise.resolve({ id: "bad" }),
    });

    expect(response.status).toBe(400);
    expect(prisma.caseResult.findUnique).not.toHaveBeenCalled();
  });

  it.each([GET, POST])("returns 404 when the case no longer exists", async (handler) => {
    (prisma.caseResult.findUnique as jest.Mock).mockResolvedValue(null);
    const request = new NextRequest(`http://localhost/api/cases/${validId}/activities`, {
      method: handler === POST ? "POST" : "GET",
      body: handler === POST ? JSON.stringify({ comment: "hello" }) : undefined,
    });

    expect((await handler(request, { params })).status).toBe(404);
    expect(getProjectAccess).not.toHaveBeenCalled();
  });

  it("denies reading activities without project visibility", async () => {
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: false, canEdit: false });

    const response = await GET(
      new NextRequest(`http://localhost/api/cases/${validId}/activities`),
      { params },
    );

    expect(response.status).toBe(403);
  });

  it.each([
    [{}, "评论内容不能为空"],
    [{ comment: 12 }, "评论内容不能为空"],
    [{ comment: "   " }, "评论内容不能为空"],
    [{ comment: "x".repeat(5001) }, "评论长度不能超过"],
  ])("validates comment input %#", async (body, message) => {
    const request = new NextRequest(`http://localhost/api/cases/${validId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(request, { params });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain(message);
    expect(prisma.caseActivity.create).not.toHaveBeenCalled();
  });

  it.each([
    [GET, "findMany"],
    [POST, "create"],
  ])("maps %s database failures to 500", async (handler, method) => {
    (prisma.caseActivity[method as "findMany" | "create"] as jest.Mock)
      .mockRejectedValue(new Error("DB down"));
    const request = new NextRequest(`http://localhost/api/cases/${validId}/activities`, {
      method: handler === POST ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: handler === POST ? JSON.stringify({ comment: "hello" }) : undefined,
    });

    expect((await handler(request, { params })).status).toBe(500);
  });
});
