import { GET, POST } from "@/app/api/saved-views/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/saved-views/[id]/route";
import { generateToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    testStage: { findUnique: jest.fn() },
    batchScope: { findUnique: jest.fn() },
    savedView: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const now = new Date("2026-07-26T00:00:00.000Z");
const personalView = {
  id: "view_1",
  ownerId: "user_1",
  projectId: null,
  name: "我的失败用例",
  filters: { resultSummary: "FAIL" },
  scope: "PERSONAL" as const,
  isDefault: true,
  createdAt: now,
  updatedAt: now,
  owner: { username: "alice" },
};
const projectView = {
  ...personalView,
  id: "view_2",
  projectId: "project_1",
  name: "项目待分析",
  filters: { projectId: "project_1", progressCategory: "PENDING" },
  scope: "PROJECT" as const,
  isDefault: false,
};
const routeParams = (id = "view_1") => ({
  params: Promise.resolve({ id }),
});

function request(path: string, method = "GET", body?: unknown, authenticated = true) {
  const req = new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  if (authenticated) {
    req.headers.set(
      "cookie",
      `run_insight_token=${generateToken({
        userId: "user_1",
        username: "alice",
      })}`,
    );
  }
  return req;
}

describe("saved view APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project_1",
    });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    (mockPrisma.savedView.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.savedView.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (callback: unknown) => {
        if (typeof callback !== "function") throw new Error("invalid transaction");
        return (callback as (client: typeof prisma) => Promise<unknown>)(prisma);
      },
    );
  });

  it("requires authentication", async () => {
    const response = await GET(request("/api/saved-views", "GET", undefined, false));
    expect(response.status).toBe(401);
  });

  it("lists personal views without a project", async () => {
    (mockPrisma.savedView.findMany as jest.Mock).mockResolvedValue([personalView]);

    const response = await GET(request("/api/saved-views"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canShare).toBe(false);
    expect(body.views[0]).toEqual(
      expect.objectContaining({
        name: "我的失败用例",
        isOwner: true,
        canManage: true,
      }),
    );
    expect(mockPrisma.savedView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ ownerId: "user_1", scope: "PERSONAL" }] },
      }),
    );
  });

  it("lists project views for viewers but does not grant management", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });
    (mockPrisma.savedView.findMany as jest.Mock).mockResolvedValue([projectView]);

    const response = await GET(
      request("/api/saved-views?projectId=project_1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canShare).toBe(false);
    expect(body.views[0].canManage).toBe(false);
  });

  it("forbids listing project views without project access", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      request("/api/saved-views?projectId=project_1"),
    );

    expect(response.status).toBe(403);
    expect(mockPrisma.savedView.findMany).not.toHaveBeenCalled();
  });

  it("rejects a project scope that does not exist", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(null);

    const listed = await GET(
      request("/api/saved-views?projectId=missing_project"),
    );
    const created = await POST(
      request("/api/saved-views", "POST", {
        name: "不存在的项目",
        filters: { projectId: "missing_project" },
      }),
    );

    expect(listed.status).toBe(404);
    expect(created.status).toBe(400);
  });

  it("returns 404 when creating a shared view for a missing project", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      request("/api/saved-views", "POST", {
        name: "共享视图",
        scope: "PROJECT",
        projectId: "missing_project",
        filters: { projectId: "missing_project" },
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "NOT_FOUND",
      message: "项目不存在",
    });
  });

  it("creates a normalized personal default view", async () => {
    (mockPrisma.savedView.create as jest.Mock).mockResolvedValue(personalView);

    const response = await POST(
      request("/api/saved-views", "POST", {
        name: "  我的失败用例  ",
        scope: "PERSONAL",
        isDefault: true,
        filters: { resultSummary: "FAIL", search: "  支付  " },
      }),
    );

    expect(response.status).toBe(201);
    expect(mockPrisma.savedView.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: "user_1",
        scope: "PERSONAL",
        projectId: null,
      },
      data: { isDefault: false },
    });
    expect(mockPrisma.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "我的失败用例",
          filters: { resultSummary: "FAIL", search: "支付" },
          isDefault: true,
        }),
      }),
    );
  });

  it.each([
    [{ filters: { injected: "value" } }, "不支持的筛选字段"],
    [{ filters: { progressCategory: "DONE" } }, "进展筛选值不合法"],
    [{ filters: { assetSaved: "yes" } }, "资产状态筛选值不合法"],
    [{ filters: { dateFrom: "2026-02-31" } }, "必须是有效的"],
    [{ filters: { stageId: "stage_1" } }, "必须同时保存项目"],
    [{ filters: [] }, "必须是对象"],
  ])("rejects invalid filter payload %#", async (patch, message) => {
    const response = await POST(
      request("/api/saved-views", "POST", {
        name: "视图",
        scope: "PERSONAL",
        ...patch,
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain(message);
  });

  it.each([
    [null, "请求体必须是 JSON 对象"],
    [[], "请求体必须是 JSON 对象"],
    [{ name: "视图", filters: {}, unexpected: true }, "不支持的字段"],
  ])("rejects invalid top-level request body %#", async (body, message) => {
    const response = await POST(
      request("/api/saved-views", "POST", body),
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error).toEqual({
      error: "VALIDATION_ERROR",
      message: expect.stringContaining(message),
    });
    expect(mockPrisma.savedView.create).not.toHaveBeenCalled();
  });

  it("creates a project view only for project editors", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      projectId: "project_1",
    });
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      projectId: "project_1",
      testStageId: "stage_1",
    });
    (mockPrisma.savedView.create as jest.Mock).mockResolvedValue(projectView);

    const response = await POST(
      request("/api/saved-views", "POST", {
        name: "项目待分析",
        scope: "PROJECT",
        projectId: "project_1",
        filters: {
          projectId: "project_1",
          stageId: "stage_1",
          batchScopeId: "batch_1",
          progressCategory: "PENDING",
        },
      }),
    );

    expect(response.status).toBe(201);
  });

  it("forbids project viewers from creating shared views", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });

    const response = await POST(
      request("/api/saved-views", "POST", {
        name: "共享视图",
        scope: "PROJECT",
        projectId: "project_1",
        filters: { projectId: "project_1" },
      }),
    );

    expect(response.status).toBe(403);
  });

  it.each([
    [
      { id: "project_1", archived: true },
      { projectId: "project_1" },
      "已归档项目",
    ],
    [
      { id: "project_1", archived: false },
      { projectId: "project_1", stageId: "stage_1" },
      "已归档阶段",
    ],
  ])(
    "rejects saved filters that target archived resources %#",
    async (projectRecord, filters, message) => {
      (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(projectRecord);
      if ("stageId" in filters && filters.stageId) {
        (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
          projectId: "project_1",
          archived: true,
        });
      }

      const response = await POST(
        request("/api/saved-views", "POST", {
          name: "归档资源视图",
          scope: "PERSONAL",
          filters,
        }),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).message).toContain(message);
      expect(mockPrisma.savedView.create).not.toHaveBeenCalled();
    },
  );

  it("rejects saved filters that target an archived batch", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project_1",
      archived: false,
    });
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      projectId: "project_1",
      archived: false,
    });
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      projectId: "project_1",
      testStageId: "stage_1",
      archived: true,
    });

    const response = await POST(
      request("/api/saved-views", "POST", {
        name: "归档批跑视图",
        scope: "PERSONAL",
        filters: {
          projectId: "project_1",
          stageId: "stage_1",
          batchScopeId: "batch_1",
        },
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("已归档批跑");
  });

  it("rejects duplicate names in the same scope", async () => {
    (mockPrisma.savedView.findFirst as jest.Mock).mockResolvedValue({ id: "old" });
    const response = await POST(
      request("/api/saved-views", "POST", {
        name: "重复",
        filters: {},
      }),
    );
    expect(response.status).toBe(409);
  });

  it("updates filters and sets a view as default", async () => {
    (mockPrisma.savedView.findUnique as jest.Mock).mockResolvedValue({
      ...personalView,
      owner: undefined,
    });
    (mockPrisma.savedView.update as jest.Mock).mockResolvedValue({
      ...personalView,
      filters: { resultSummary: "PASS" },
      owner: undefined,
    });

    const response = await PATCH(
      request("/api/saved-views/view_1", "PATCH", {
        filters: { resultSummary: "PASS" },
        isDefault: true,
      }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.savedView.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: "user_1", NOT: { id: "view_1" } }),
      }),
    );
    expect(mockPrisma.savedView.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          filters: { resultSummary: "PASS" },
          isDefault: true,
        },
      }),
    );
  });

  it("forbids updating or deleting another user's view", async () => {
    (mockPrisma.savedView.findUnique as jest.Mock).mockResolvedValue({
      ...personalView,
      ownerId: "user_2",
      owner: undefined,
    });

    const updated = await PATCH(
      request("/api/saved-views/view_1", "PATCH", { name: "改名" }),
      routeParams(),
    );
    const deleted = await DELETE(
      request("/api/saved-views/view_1", "DELETE"),
      routeParams(),
    );

    expect(updated.status).toBe(403);
    expect(deleted.status).toBe(403);
  });

  it("lets a project administrator manage another owner's shared view", async () => {
    (mockPrisma.savedView.findUnique as jest.Mock).mockResolvedValue({
      ...projectView,
      ownerId: "user_2",
      owner: undefined,
    });
    (mockPrisma.savedView.update as jest.Mock).mockResolvedValue({
      ...projectView,
      ownerId: "user_2",
      name: "管理员修订",
      owner: { username: "bob" },
    });

    const response = await PATCH(
      request("/api/saved-views/view_2", "PATCH", { name: "管理员修订" }),
      routeParams("view_2"),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.savedView.update).toHaveBeenCalled();
  });

  it("does not let a project editor take over another owner's shared view", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.savedView.findUnique as jest.Mock).mockResolvedValue({
      ...projectView,
      ownerId: "user_2",
      owner: undefined,
    });

    const response = await PATCH(
      request("/api/saved-views/view_2", "PATCH", { name: "越权修改" }),
      routeParams("view_2"),
    );

    expect(response.status).toBe(403);
    expect(mockPrisma.savedView.update).not.toHaveBeenCalled();
  });

  it("blocks modifications to a shared view after its project is archived", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project_1",
      archived: true,
    });
    (mockPrisma.savedView.findUnique as jest.Mock).mockResolvedValue({
      ...projectView,
      owner: undefined,
    });

    const response = await PATCH(
      request("/api/saved-views/view_2", "PATCH", { name: "归档后修改" }),
      routeParams("view_2"),
    );

    expect(response.status).toBe(409);
    expect(mockPrisma.savedView.update).not.toHaveBeenCalled();
  });

  it("deletes an owned personal view", async () => {
    (mockPrisma.savedView.findUnique as jest.Mock).mockResolvedValue({
      ...personalView,
      owner: undefined,
    });
    (mockPrisma.savedView.delete as jest.Mock).mockResolvedValue(personalView);

    const response = await DELETE(
      request("/api/saved-views/view_1", "DELETE"),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
  });
});
