import {
  GET,
  POST,
} from "@/app/api/root-cause-categories/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/root-cause-categories/[id]/route";
import { generateToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    rootCauseCategory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const now = new Date("2026-07-25T00:00:00.000Z");
const category = {
  id: "root_1",
  projectId: "project_1",
  name: "代码缺陷",
  description: "产品代码问题",
  archived: false,
  createdAt: now,
  updatedAt: now,
  _count: { cases: 2, assets: 1 },
};
const globalCategory = {
  ...category,
  id: "root_global",
  projectId: null,
};
const params = { params: Promise.resolve({ id: "root_1" }) };

function request(path: string, method = "GET", body?: unknown) {
  const req = new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  req.headers.set(
    "cookie",
    `run_insight_token=${generateToken({ userId: "user_1", username: "admin" })}`
  );
  return req;
}

describe("root cause category APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("lists global and project categories with usage counts", async () => {
    (mockPrisma.rootCauseCategory.findMany as jest.Mock).mockResolvedValue([category]);
    const response = await GET(
      request("/api/root-cause-categories?projectId=project_1")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.categories[0].usageCount).toBe(3);
    expect(body.canManage).toBe(true);
    expect(mockPrisma.rootCauseCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archived: false,
          OR: [{ projectId: null }, { projectId: "project_1" }],
        },
      })
    );
  });

  it("lists only global categories and can include archived entries", async () => {
    (mockPrisma.rootCauseCategory.findMany as jest.Mock).mockResolvedValue([
      {
        id: "root_global",
        projectId: null,
        name: "环境问题",
        description: null,
        archived: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const response = await GET(
      request("/api/root-cause-categories?includeArchived=true")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.categories[0].usageCount).toBeUndefined();
    expect(body.canManage).toBe(true);
    expect(mockPrisma.rootCauseCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: null } })
    );
  });

  it("marks global categories read-only for non-admins", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.rootCauseCategory.findMany as jest.Mock).mockResolvedValue([]);
    const response = await GET(request("/api/root-cause-categories"));
    expect(response.status).toBe(200);
    expect((await response.json()).canManage).toBe(false);
  });

  it("forbids category listing outside the project", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await GET(
      request("/api/root-cause-categories?projectId=project_1")
    );
    expect(response.status).toBe(403);
  });

  it("reports project admin capability separately from visibility", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });
    (mockPrisma.rootCauseCategory.findMany as jest.Mock).mockResolvedValue([]);
    const response = await GET(
      request("/api/root-cause-categories?projectId=project_1")
    );
    expect(response.status).toBe(200);
    expect((await response.json()).canManage).toBe(false);
  });

  it("returns an internal error when category listing fails", async () => {
    (mockPrisma.rootCauseCategory.findMany as jest.Mock).mockRejectedValue(
      new Error("db")
    );
    const response = await GET(request("/api/root-cause-categories"));
    expect(response.status).toBe(500);
  });

  it("creates a project category for project admins", async () => {
    (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.rootCauseCategory.create as jest.Mock).mockResolvedValue(category);
    const response = await POST(
      request("/api/root-cause-categories", "POST", {
        projectId: "project_1",
        name: "代码缺陷",
        description: "产品代码问题",
      })
    );
    expect(response.status).toBe(201);
  });

  it("creates a trimmed global category with a null description", async () => {
    (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.rootCauseCategory.create as jest.Mock).mockResolvedValue({
      ...globalCategory,
      name: "环境问题",
      description: null,
    });

    const response = await POST(
      request("/api/root-cause-categories", "POST", {
        projectId: 123,
        name: " 环境问题 ",
        description: " ",
      })
    );
    expect(response.status).toBe(201);
    expect(mockPrisma.rootCauseCategory.create).toHaveBeenCalledWith({
      data: { projectId: null, name: "环境问题", description: null },
    });
  });

  it("forbids global creation for non-admins", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    const response = await POST(
      request("/api/root-cause-categories", "POST", { name: "代码缺陷" })
    );
    expect(response.status).toBe(403);
    expect(mockPrisma.rootCauseCategory.create).not.toHaveBeenCalled();
  });

  it("forbids project creation for project editors", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    const response = await POST(
      request("/api/root-cause-categories", "POST", {
        projectId: "project_1",
        name: "代码缺陷",
      })
    );
    expect(response.status).toBe(403);
  });

  it.each([
    [{}, "分类名称不能为空"],
    [{ name: 123 }, "分类名称不能为空"],
    [{ name: " " }, "分类名称不能为空"],
    [{ name: "x".repeat(101) }, "分类名称长度不能超过100个字符"],
    [{ name: "代码缺陷", description: 123 }, "分类说明格式不正确"],
    [
      { name: "代码缺陷", description: "x".repeat(1001) },
      "分类说明长度不能超过1000个字符",
    ],
  ])("validates create payload %#", async (body, message) => {
    const response = await POST(
      request("/api/root-cause-categories", "POST", body)
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(message);
  });

  it("rejects duplicate names in the same scope", async () => {
    (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue({
      id: "existing",
    });
    const response = await POST(
      request("/api/root-cause-categories", "POST", { name: "代码缺陷" })
    );
    expect(response.status).toBe(409);
  });

  it("updates and deletes a category", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(category);
    (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.rootCauseCategory.update as jest.Mock).mockResolvedValue({
      ...category,
      archived: true,
    });
    const updated = await PATCH(
      request("/api/root-cause-categories/root_1", "PATCH", { archived: true }),
      { params: Promise.resolve({ id: "root_1" }) }
    );
    expect(updated.status).toBe(200);

    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      ...category,
      _count: { cases: 0, assets: 0 },
    });
    (mockPrisma.rootCauseCategory.delete as jest.Mock).mockResolvedValue(category);
    const deleted = await DELETE(
      request("/api/root-cause-categories/root_1", "DELETE"),
      { params: Promise.resolve({ id: "root_1" }) }
    );
    expect(deleted.status).toBe(200);
  });

  it("rejects deleting a referenced category", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(category);

    const response = await DELETE(
      request("/api/root-cause-categories/root_1", "DELETE"),
      { params: Promise.resolve({ id: "root_1" }) }
    );

    expect(response.status).toBe(409);
    expect(mockPrisma.rootCauseCategory.delete).not.toHaveBeenCalled();
  });

  it("maps unique constraint races to conflict", async () => {
    (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.rootCauseCategory.create as jest.Mock).mockRejectedValue({
      code: "P2002",
    });

    const response = await POST(
      request("/api/root-cause-categories", "POST", { name: "代码缺陷" })
    );

    expect(response.status).toBe(409);
  });

  it.each([null, "P2002", { code: "P2025" }])(
    "maps non-P2002 create failures to internal errors %#",
    async (error) => {
      (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.rootCauseCategory.create as jest.Mock).mockRejectedValue(error);
      const response = await POST(
        request("/api/root-cause-categories", "POST", { name: "代码缺陷" })
      );
      expect(response.status).toBe(500);
    }
  );

  it("forbids project editors from category management", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(category);
    const response = await PATCH(
      request("/api/root-cause-categories/root_1", "PATCH", { archived: true }),
      { params: Promise.resolve({ id: "root_1" }) }
    );
    expect(response.status).toBe(403);
  });

  it("updates a global category for a system admin", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(
      globalCategory
    );
    (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.rootCauseCategory.update as jest.Mock).mockResolvedValue({
      ...globalCategory,
      name: "环境故障",
      description: null,
      archived: true,
    });

    const response = await PATCH(
      request("/api/root-cause-categories/root_global", "PATCH", {
        name: " 环境故障 ",
        description: " ",
        archived: true,
      }),
      { params: Promise.resolve({ id: "root_global" }) }
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.rootCauseCategory.update).toHaveBeenCalledWith({
      where: { id: "root_global" },
      data: { name: "环境故障", description: null, archived: true },
    });
  });

  it("forbids non-admins from updating global categories", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(
      globalCategory
    );
    const response = await PATCH(
      request("/api/root-cause-categories/root_global", "PATCH", {
        archived: true,
      }),
      { params: Promise.resolve({ id: "root_global" }) }
    );
    expect(response.status).toBe(403);
  });

  it("returns not found when updating a missing category", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await PATCH(
      request("/api/root-cause-categories/root_1", "PATCH", { archived: true }),
      params
    );
    expect(response.status).toBe(404);
  });

  it.each([
    [{ name: null }, "分类名称不能为空"],
    [{ name: " " }, "分类名称不能为空"],
    [{ name: "x".repeat(101) }, "分类名称长度不能超过100个字符"],
    [{ description: 123 }, "分类说明格式不正确"],
    [
      { description: "x".repeat(1001) },
      "分类说明长度不能超过1000个字符",
    ],
    [{ archived: "true" }, "归档状态格式不正确"],
    [{ ignored: true }, "没有可更新的字段"],
  ])("validates update payload %#", async (body, message) => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(
      category
    );
    const response = await PATCH(
      request("/api/root-cause-categories/root_1", "PATCH", body),
      params
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(message);
  });

  it("rejects duplicate names when updating", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(
      category
    );
    (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue({
      id: "other",
    });
    const response = await PATCH(
      request("/api/root-cause-categories/root_1", "PATCH", {
        name: "代码缺陷",
      }),
      params
    );
    expect(response.status).toBe(409);
  });

  it("accepts a trimmed non-empty description", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(
      category
    );
    (mockPrisma.rootCauseCategory.update as jest.Mock).mockResolvedValue({
      ...category,
      description: "新说明",
    });
    const response = await PATCH(
      request("/api/root-cause-categories/root_1", "PATCH", {
        description: " 新说明 ",
      }),
      params
    );
    expect(response.status).toBe(200);
  });

  it("maps P2002 update races to conflict", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(
      category
    );
    (mockPrisma.rootCauseCategory.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.rootCauseCategory.update as jest.Mock).mockRejectedValue({
      code: "P2002",
    });
    const response = await PATCH(
      request("/api/root-cause-categories/root_1", "PATCH", {
        name: "新分类",
      }),
      params
    );
    expect(response.status).toBe(409);
  });

  it.each([undefined, "P2002", { code: "P2025" }])(
    "maps non-P2002 update failures to internal errors %#",
    async (error) => {
      (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(
        category
      );
      (mockPrisma.rootCauseCategory.update as jest.Mock).mockRejectedValue(error);
      const response = await PATCH(
        request("/api/root-cause-categories/root_1", "PATCH", {
          archived: true,
        }),
        params
      );
      expect(response.status).toBe(500);
    }
  );

  it("returns not found and forbidden for invalid deletes", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValueOnce(
      null
    );
    expect(
      (
        await DELETE(
          request("/api/root-cause-categories/root_1", "DELETE"),
          params
        )
      ).status
    ).toBe(404);

    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValueOnce({
      ...category,
      _count: { cases: 0, assets: 0 },
    });
    expect(
      (
        await DELETE(
          request("/api/root-cause-categories/root_1", "DELETE"),
          params
        )
      ).status
    ).toBe(403);
  });

  it("rejects deletion when only assets reference the category", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      ...category,
      _count: { cases: 0, assets: 1 },
    });
    const response = await DELETE(
      request("/api/root-cause-categories/root_1", "DELETE"),
      params
    );
    expect(response.status).toBe(409);
  });

  it("deletes an unused global category for a system admin", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      ...globalCategory,
      _count: { cases: 0, assets: 0 },
    });
    (mockPrisma.rootCauseCategory.delete as jest.Mock).mockResolvedValue(
      globalCategory
    );
    const response = await DELETE(
      request("/api/root-cause-categories/root_global", "DELETE"),
      { params: Promise.resolve({ id: "root_global" }) }
    );
    expect(response.status).toBe(200);
  });

  it("forbids a non-admin from deleting a global category", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      ...globalCategory,
      _count: { cases: 0, assets: 0 },
    });
    const response = await DELETE(
      request("/api/root-cause-categories/root_global", "DELETE"),
      { params: Promise.resolve({ id: "root_global" }) }
    );
    expect(response.status).toBe(403);
  });

  it("returns an internal error when delete fails", async () => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      ...category,
      _count: { cases: 0, assets: 0 },
    });
    (mockPrisma.rootCauseCategory.delete as jest.Mock).mockRejectedValue(
      new Error("db")
    );
    const response = await DELETE(
      request("/api/root-cause-categories/root_1", "DELETE"),
      params
    );
    expect(response.status).toBe(500);
  });

  it("requires authentication for all category endpoints", async () => {
    const unauthenticated = new NextRequest(
      "http://localhost/api/root-cause-categories"
    );
    expect((await GET(unauthenticated)).status).toBe(401);
    expect(
      (
        await POST(
          new NextRequest("http://localhost/api/root-cause-categories", {
            method: "POST",
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await PATCH(
          new NextRequest("http://localhost/api/root-cause-categories/root_1", {
            method: "PATCH",
          }),
          params
        )
      ).status
    ).toBe(401);
    expect(
      (
        await DELETE(
          new NextRequest("http://localhost/api/root-cause-categories/root_1", {
            method: "DELETE",
          }),
          params
        )
      ).status
    ).toBe(401);
  });
});
