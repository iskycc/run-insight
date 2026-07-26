import { NextRequest, NextResponse } from "next/server";
import {
  DELETE,
  PATCH,
} from "@/app/api/cases/[id]/activities/[activityId]/route";
import { authenticateRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/audit", () => ({ writeAuditLog: jest.fn() }));
jest.mock("@/lib/project-access", () => ({ getProjectAccess: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseActivity: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const caseId = "clxxxxxxxxxxxxxxxxxxxxxx1";
const otherCaseId = "clxxxxxxxxxxxxxxxxxxxxxx2";
const activityId = "clxxxxxxxxxxxxxxxxxxxxxx3";
const params = Promise.resolve({ id: caseId, activityId });

const commentActivity = {
  id: activityId,
  caseResultId: caseId,
  userId: "u1",
  type: "COMMENT",
  comment: "原评论",
  createdAt: new Date("2026-07-25T00:00:00Z"),
  user: { id: "u1", username: "alice" },
  caseResult: { projectId: "p1" },
};

function request(
  method: "PATCH" | "DELETE",
  body?: Record<string, unknown>,
) {
  return new NextRequest(
    `http://localhost/api/cases/${caseId}/activities/${activityId}`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

describe("/api/cases/[id]/activities/[activityId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({
      userId: "u1",
      username: "alice",
    });
    (prisma.caseActivity.findUnique as jest.Mock).mockResolvedValue(
      commentActivity,
    );
    (getProjectAccess as jest.Mock).mockResolvedValue({
      canView: true,
      canEdit: true,
      canAdmin: false,
    });
    (prisma.caseActivity.update as jest.Mock).mockResolvedValue({
      ...commentActivity,
      comment: "修改后",
    });
    (prisma.caseActivity.delete as jest.Mock).mockResolvedValue(
      commentActivity,
    );
  });

  it("lets the author edit a trimmed comment and writes an audit log", async () => {
    const response = await PATCH(request("PATCH", { comment: "  修改后  " }), {
      params,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.caseActivity.update).toHaveBeenCalledWith({
      where: { id: activityId },
      data: { comment: "修改后" },
      include: { user: { select: { id: true, username: true } } },
    });
    expect(body.activity).toEqual(
      expect.objectContaining({
        id: activityId,
        comment: "修改后",
        canManage: true,
      }),
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "caseActivity",
        entityId: activityId,
      }),
    );
  });

  it("lets a project administrator delete another user's comment", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue({
      userId: "admin-user",
      username: "admin",
    });
    (getProjectAccess as jest.Mock).mockResolvedValue({
      canView: true,
      canEdit: true,
      canAdmin: true,
    });

    const response = await DELETE(request("DELETE"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(prisma.caseActivity.delete).toHaveBeenCalledWith({
      where: { id: activityId },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entityType: "caseActivity",
        entityId: activityId,
      }),
    );
  });

  it("lets the original author delete an existing comment", async () => {
    const response = await DELETE(request("DELETE"), { params });

    expect(response.status).toBe(200);
    expect(prisma.caseActivity.delete).toHaveBeenCalledWith({
      where: { id: activityId },
    });
  });

  it("lets a project administrator edit another user's comment", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue({
      userId: "admin-user",
      username: "admin",
    });
    (getProjectAccess as jest.Mock).mockResolvedValue({
      canView: true,
      canEdit: true,
      canAdmin: true,
    });

    const response = await PATCH(request("PATCH", { comment: "管理员修订" }), {
      params,
    });

    expect(response.status).toBe(200);
    expect(prisma.caseActivity.update).toHaveBeenCalled();
  });

  it.each([PATCH, DELETE])(
    "passes through authentication failures",
    async (handler) => {
      (authenticateRequest as jest.Mock).mockReturnValue(
        NextResponse.json(
          { error: "UNAUTHORIZED", message: "未登录" },
          { status: 401 },
        ),
      );

      const response = await handler(
        request(handler === PATCH ? "PATCH" : "DELETE", { comment: "内容" }),
        { params },
      );

      expect(response.status).toBe(401);
      expect(prisma.caseActivity.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each([PATCH, DELETE])(
    "rejects invalid case or activity IDs",
    async (handler) => {
      const response = await handler(
        request(handler === PATCH ? "PATCH" : "DELETE", { comment: "内容" }),
        {
          params: Promise.resolve({
            id: handler === PATCH ? "bad" : caseId,
            activityId: handler === DELETE ? "bad" : activityId,
          }),
        },
      );

      expect(response.status).toBe(400);
      expect(prisma.caseActivity.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each([PATCH, DELETE])(
    "returns 404 for a missing or cross-case activity",
    async (handler) => {
      (prisma.caseActivity.findUnique as jest.Mock).mockResolvedValue(
        handler === PATCH
          ? null
          : { ...commentActivity, caseResultId: otherCaseId },
      );

      const response = await handler(
        request(handler === PATCH ? "PATCH" : "DELETE", { comment: "内容" }),
        { params },
      );

      expect(response.status).toBe(404);
      expect(getProjectAccess).not.toHaveBeenCalled();
    },
  );

  it.each([PATCH, DELETE])(
    "requires visibility of the comment's project",
    async (handler) => {
      (getProjectAccess as jest.Mock).mockResolvedValue({
        canView: false,
        canEdit: false,
        canAdmin: false,
      });

      const response = await handler(
        request(handler === PATCH ? "PATCH" : "DELETE", { comment: "内容" }),
        { params },
      );

      expect(response.status).toBe(403);
    },
  );

  it.each([PATCH, DELETE])(
    "blocks comment mutations after the case hierarchy is archived",
    async (handler) => {
      (prisma.caseActivity.findUnique as jest.Mock).mockResolvedValue({
        ...commentActivity,
        caseResult: {
          projectId: "p1",
          project: { archived: true },
          stage: { archived: false },
          batchScope: { archived: false },
        },
      });

      const response = await handler(
        request(handler === PATCH ? "PATCH" : "DELETE", { comment: "内容" }),
        { params },
      );

      expect(response.status).toBe(409);
      expect(prisma.caseActivity.update).not.toHaveBeenCalled();
      expect(prisma.caseActivity.delete).not.toHaveBeenCalled();
    },
  );

  it.each([PATCH, DELETE])(
    "never modifies non-comment activities",
    async (handler) => {
      (prisma.caseActivity.findUnique as jest.Mock).mockResolvedValue({
        ...commentActivity,
        type: "UPDATED",
        comment: null,
      });

      const response = await handler(
        request(handler === PATCH ? "PATCH" : "DELETE", { comment: "内容" }),
        { params },
      );

      expect(response.status).toBe(409);
      expect(prisma.caseActivity.update).not.toHaveBeenCalled();
      expect(prisma.caseActivity.delete).not.toHaveBeenCalled();
    },
  );

  it.each([PATCH, DELETE])(
    "denies non-author project editors",
    async (handler) => {
      (authenticateRequest as jest.Mock).mockReturnValue({
        userId: "u2",
        username: "bob",
      });

      const response = await handler(
        request(handler === PATCH ? "PATCH" : "DELETE", { comment: "内容" }),
        { params },
      );

      expect(response.status).toBe(403);
    },
  );

  it.each([
    [{}, "评论内容不能为空"],
    [{ comment: 12 }, "评论内容不能为空"],
    [{ comment: "   " }, "评论内容不能为空"],
    [{ comment: "x".repeat(5001) }, "评论长度不能超过"],
  ])("validates edited comment input %#", async (body, message) => {
    const response = await PATCH(request("PATCH", body), { params });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain(message);
    expect(prisma.caseActivity.update).not.toHaveBeenCalled();
  });

  it("maps update failures to a safe 500 response", async () => {
    (prisma.caseActivity.update as jest.Mock).mockRejectedValue(
      new Error("DB down"),
    );

    const response = await PATCH(request("PATCH", { comment: "内容" }), {
      params,
    });

    expect(response.status).toBe(500);
    expect((await response.json()).message).toBe("编辑评论失败");
  });

  it("maps delete failures to a safe 500 response", async () => {
    (prisma.caseActivity.delete as jest.Mock).mockRejectedValue(
      new Error("DB down"),
    );

    const response = await DELETE(request("DELETE"), { params });

    expect(response.status).toBe(500);
    expect((await response.json()).message).toBe("删除评论失败");
  });
});
