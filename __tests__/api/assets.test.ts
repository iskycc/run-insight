import { GET, POST as createAsset } from "@/app/api/assets/route";
import {
  GET as getAsset,
  PATCH as updateAsset,
} from "@/app/api/assets/[id]/route";
import { POST as reuseAsset } from "@/app/api/assets/[id]/reuse/route";
import { POST as recordAssetView } from "@/app/api/assets/[id]/view/route";
import { generateToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => {
  const assetClient = {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const assetVersion = {
    create: jest.fn(),
  };
  const client = {
    user: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    asset: assetClient,
    assetVersion,
    rootCauseCategory: { findUnique: jest.fn() },
    $transaction: jest.fn(
      async (
        callback: (tx: {
          asset: typeof assetClient;
          assetVersion: typeof assetVersion;
        }) => Promise<unknown>,
      ) => callback({ asset: assetClient, assetVersion }),
    ),
  };
  return { prisma: client };
});

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const assetId = "asset_1";
const now = new Date("2026-07-25T00:00:00.000Z");
const asset = {
  id: assetId,
  sourceCaseId: "clxxxxxxxxxxxxxxxxxxxxxx1",
  projectId: "project_1",
  rootCauseCategoryId: "root_1",
  title: "登录失败分析",
  summary: "登录接口返回 500",
  solution: "修复空值处理",
  rootCauseText: "空指针",
  tags: ["登录", "回归"],
  status: "DRAFT" as const,
  version: 1,
  createdBy: "user_1",
  updatedBy: "user_1",
  viewCount: 0,
  reuseCount: 0,
  createdAt: now,
  updatedAt: now,
  project: { id: "project_1", name: "项目一", members: [] },
  rootCauseCategory: { id: "root_1", name: "代码缺陷" },
  sourceCase: {
    id: "clxxxxxxxxxxxxxxxxxxxxxx1",
    caseNo: "TC-1",
    name: "登录",
    resultSummary: "FAIL",
  },
  creator: { username: "admin" },
  updater: { username: "admin" },
};

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  const req = new NextRequest(new URL(path, "http://localhost"), init);
  req.headers.set(
    "cookie",
    `run_insight_token=${generateToken({ userId: "user_1", username: "admin" })}`
  );
  return req;
}

function patchRequest(body: unknown) {
  return request(`/api/assets/${assetId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const params = { params: Promise.resolve({ id: assetId }) };

describe("asset APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("lists independent assets with filters", async () => {
    (mockPrisma.asset.findMany as jest.Mock).mockResolvedValue([asset]);
    (mockPrisma.asset.count as jest.Mock).mockResolvedValue(1);

    const response = await GET(
      request("/api/assets?status=DRAFT&tag=登录&rootCauseCategoryId=root_1&search=登录")
    );
    expect(response.status).toBe(200);
    expect((await response.json()).assets[0]).toMatchObject({
      id: assetId,
      tags: ["登录", "回归"],
      canEdit: true,
    });
    expect((mockPrisma.asset.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({
      status: "DRAFT",
      tags: { array_contains: "登录" },
      rootCauseCategoryId: "root_1",
    });
  });

  it("creates an independent draft and its initial version atomically", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project_1",
    });
    (mockPrisma.asset.create as jest.Mock).mockResolvedValue(asset);

    const response = await createAsset(
      request("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "project_1",
          title: "登录失败分析",
          summary: "登录接口返回 500",
          solution: "修复空值处理",
          tags: ["登录"],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockPrisma.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "project_1",
          status: "DRAFT",
          createdBy: "user_1",
        }),
      }),
    );
    expect(mockPrisma.assetVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId,
        version: 1,
        status: "DRAFT",
      }),
    });
  });

  it("normalizes pagination and applies root-cause filters", async () => {
    (mockPrisma.asset.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.asset.count as jest.Mock).mockResolvedValue(0);

    const response = await GET(
      request("/api/assets?page=invalid&pageSize=999&rootCause=空指针")
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rootCauseText: { contains: "空指针" },
        }),
        skip: 0,
        take: 100,
      })
    );
  });

  it("rejects an invalid status", async () => {
    const response = await GET(request("/api/assets?status=UNKNOWN"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when the authenticated user no longer exists", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await GET(request("/api/assets"));
    expect(response.status).toBe(401);
  });

  it("forbids users outside a requested project", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await GET(request("/api/assets?projectId=project_1"));
    expect(response.status).toBe(403);
  });

  it("limits a project viewer to published assets", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });
    (mockPrisma.asset.findMany as jest.Mock).mockResolvedValue([
      {
        ...asset,
        status: "PUBLISHED",
        project: {
          id: "project_1",
          name: "项目一",
          members: [{ role: "VIEWER" }],
        },
      },
    ]);
    (mockPrisma.asset.count as jest.Mock).mockResolvedValue(1);

    const response = await GET(request("/api/assets?projectId=project_1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets[0].canEdit).toBe(false);
    expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project_1", status: "PUBLISHED" },
      })
    );
  });

  it("allows project editors to list drafts and marks them editable", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.asset.findMany as jest.Mock).mockResolvedValue([
      {
        ...asset,
        project: {
          id: "project_1",
          name: "项目一",
          members: [{ role: "EDITOR" }],
        },
      },
    ]);
    (mockPrisma.asset.count as jest.Mock).mockResolvedValue(1);

    const response = await GET(
      request("/api/assets?projectId=project_1&status=DRAFT")
    );
    expect(response.status).toBe(200);
    expect((await response.json()).assets[0].canEdit).toBe(true);
  });

  it("uses membership visibility rules for an unscoped viewer list", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.asset.findMany as jest.Mock).mockResolvedValue([
      {
        ...asset,
        status: "PUBLISHED",
        project: {
          id: "project_1",
          name: "项目一",
          members: [{ role: "ADMIN" }],
        },
      },
    ]);
    (mockPrisma.asset.count as jest.Mock).mockResolvedValue(1);

    const response = await GET(request("/api/assets"));
    expect(response.status).toBe(200);
    expect((await response.json()).assets[0].canEdit).toBe(true);
    expect(
      (mockPrisma.asset.findMany as jest.Mock).mock.calls[0][0].where.OR
    ).toHaveLength(2);
  });

  it("returns an internal error when listing fails", async () => {
    (mockPrisma.asset.findMany as jest.Mock).mockRejectedValue(new Error("db"));
    (mockPrisma.asset.count as jest.Mock).mockResolvedValue(0);
    const response = await GET(request("/api/assets"));
    expect(response.status).toBe(500);
  });

  it("keeps asset detail GET read-only", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    const response = await getAsset(request(`/api/assets/${assetId}`), {
      params: Promise.resolve({ id: assetId }),
    });
    expect(response.status).toBe(200);
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  it("increments view count only through the explicit view event", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue({
      id: assetId,
      projectId: "project_1",
      status: "PUBLISHED",
    });
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue({ viewCount: 1 });

    const response = await recordAssetView(
      request(`/api/assets/${assetId}/view`, { method: "POST" }),
      params,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ viewCount: 1 });
    expect(mockPrisma.asset.update).toHaveBeenCalledWith({
      where: { id: assetId },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
  });

  it("lets a viewer open a published asset without edit permission", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue({
      ...asset,
      status: "PUBLISHED",
    });
    const response = await getAsset(request(`/api/assets/${assetId}`), params);
    expect(response.status).toBe(200);
    expect((await response.json()).asset.canEdit).toBe(false);
  });

  it("handles missing, inaccessible, and failed asset detail lookups", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValueOnce(null);
    expect(
      (await getAsset(request(`/api/assets/${assetId}`), params)).status
    ).toBe(404);

    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValueOnce(asset);
    expect(
      (await getAsset(request(`/api/assets/${assetId}`), params)).status
    ).toBe(403);

    (mockPrisma.asset.findUnique as jest.Mock).mockRejectedValueOnce(
      new Error("db")
    );
    expect(
      (await getAsset(request(`/api/assets/${assetId}`), params)).status
    ).toBe(500);
  });

  it("edits an asset and increments its version", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      id: "root_1",
      projectId: null,
      archived: false,
    });
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue({
      ...asset,
      title: "新标题",
      version: 2,
      project: { id: "project_1", name: "项目一" },
    });

    const response = await updateAsset(
      request(`/api/assets/${assetId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: "新标题",
          tags: ["回归"],
          rootCauseCategoryId: "root_1",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: assetId }) }
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: { increment: 1 } }),
      })
    );
    expect(mockPrisma.assetVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId, version: 2, title: "新标题" }),
    });
  });

  it("lets an editor submit review but only a project admin can publish", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue({
      ...asset,
      status: "REVIEW",
      version: 2,
      project: { id: "project_1", name: "项目一" },
    });

    const submitted = await updateAsset(
      patchRequest({ status: "REVIEW" }),
      params,
    );
    expect(submitted.status).toBe(200);

    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue({
      ...asset,
      status: "REVIEW",
    });
    const denied = await updateAsset(
      patchRequest({ status: "PUBLISHED" }),
      params,
    );
    expect(denied.status).toBe(403);

    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue({
      ...asset,
      status: "PUBLISHED",
      version: 3,
      project: { id: "project_1", name: "项目一" },
    });
    const published = await updateAsset(
      patchRequest({ status: "PUBLISHED" }),
      params,
    );
    expect(published.status).toBe(200);
  });

  it("rejects content edits outside the draft state", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue({
      ...asset,
      status: "REVIEW",
    });
    const response = await updateAsset(
      patchRequest({ title: "审核中修改" }),
      params,
    );
    expect(response.status).toBe(409);
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  it("updates all optional asset fields and disconnects a category", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue({
      ...asset,
      summary: "新摘要",
      solution: "新方案",
      rootCauseText: null,
      rootCauseCategoryId: null,
      project: { id: "project_1", name: "项目一" },
    });

    const response = await updateAsset(
      patchRequest({
        summary: " 新摘要 ",
        solution: " 新方案 ",
        rootCauseText: " ",
        rootCauseCategoryId: null,
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summary: "新摘要",
          solution: "新方案",
          rootCauseText: null,
          rootCauseCategory: { disconnect: true },
        }),
      })
    );
  });

  it("connects a valid project root-cause category", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      id: "root_project",
      projectId: "project_1",
      archived: false,
    });
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue({
      ...asset,
      rootCauseCategoryId: "root_project",
      project: { id: "project_1", name: "项目一" },
    });

    const response = await updateAsset(
      patchRequest({ rootCauseCategoryId: "root_project" }),
      params
    );
    expect(response.status).toBe(200);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["scalar", "bad"],
  ])("rejects a %s PATCH body", async (_label, body) => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    const response = await updateAsset(patchRequest(body), params);
    expect(response.status).toBe(400);
  });

  it.each([
    ["title", 123, "资产标题不能为空"],
    ["title", " ", "资产标题不能为空"],
    ["title", "x".repeat(201), "资产标题长度不能超过200个字符"],
    ["summary", false, "资产摘要不能为空"],
    ["summary", "x".repeat(5001), "资产摘要长度不能超过5000个字符"],
    ["solution", null, "解决方案不能为空"],
    ["solution", "x".repeat(10001), "解决方案长度不能超过10000个字符"],
  ])("rejects invalid %s values", async (field, value, message) => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    const response = await updateAsset(patchRequest({ [field]: value }), params);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(message);
  });

  it.each([
    [{ rootCauseText: "x".repeat(2001) }],
    [{ rootCauseCategoryId: 123 }],
    [{ tags: "not-an-array" }],
    [{ status: "UNKNOWN" }],
    [{ ignored: true }],
  ])("rejects invalid optional PATCH data %#", async (body) => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    const response = await updateAsset(patchRequest(body), params);
    expect(response.status).toBe(400);
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: "root_1", projectId: "project_1", archived: true },
    { id: "root_1", projectId: "other_project", archived: false },
  ])("rejects unavailable root-cause category %#", async (category) => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(
      category
    );
    const response = await updateAsset(
      patchRequest({ rootCauseCategoryId: "root_1" }),
      params
    );
    expect(response.status).toBe(400);
  });

  it("handles PATCH not-found and database failures", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValueOnce(null);
    expect((await updateAsset(patchRequest({ title: "新标题" }), params)).status).toBe(
      404
    );

    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValueOnce(asset);
    (mockPrisma.asset.update as jest.Mock).mockRejectedValueOnce(new Error("db"));
    expect((await updateAsset(patchRequest({ title: "新标题" }), params)).status).toBe(
      500
    );
  });

  it("allows viewers to reuse published assets but not edit", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);

    const denied = await updateAsset(
      request(`/api/assets/${assetId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "不能修改" }),
      }),
      { params: Promise.resolve({ id: assetId }) }
    );
    expect(denied.status).toBe(403);

    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue({
      id: assetId,
      projectId: "project_1",
      status: "PUBLISHED",
    });
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue({ reuseCount: 3 });
    const reused = await reuseAsset(
      request(`/api/assets/${assetId}/reuse`, { method: "POST" }),
      { params: Promise.resolve({ id: assetId }) }
    );
    expect(reused.status).toBe(200);
    expect((await reused.json()).reuseCount).toBe(3);
  });

  it("hides non-published assets from project viewers", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });

    const response = await GET(
      request("/api/assets?projectId=project_1&status=DRAFT")
    );

    expect(response.status).toBe(403);
    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
  });

  it("forbids viewers from opening draft asset details", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);

    const response = await getAsset(request(`/api/assets/${assetId}`), {
      params: Promise.resolve({ id: assetId }),
    });

    expect(response.status).toBe(403);
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  it("rejects reuse of archived assets", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue({
      id: assetId,
      projectId: "project_1",
      status: "ARCHIVED",
    });

    const response = await reuseAsset(
      request(`/api/assets/${assetId}/reuse`, { method: "POST" }),
      { params: Promise.resolve({ id: assetId }) }
    );

    expect(response.status).toBe(409);
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  it("handles reuse not-found, access, draft, and database errors", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValueOnce(null);
    expect(
      (
        await reuseAsset(
          request(`/api/assets/${assetId}/reuse`, { method: "POST" }),
          params
        )
      ).status
    ).toBe(404);

    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValueOnce({
      id: assetId,
      projectId: "project_1",
      status: "PUBLISHED",
    });
    expect(
      (
        await reuseAsset(
          request(`/api/assets/${assetId}/reuse`, { method: "POST" }),
          params
        )
      ).status
    ).toBe(403);

    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValueOnce({
      id: assetId,
      projectId: "project_1",
      status: "DRAFT",
    });
    expect(
      (
        await reuseAsset(
          request(`/api/assets/${assetId}/reuse`, { method: "POST" }),
          params
        )
      ).status
    ).toBe(403);

    (mockPrisma.asset.findUnique as jest.Mock).mockRejectedValueOnce(
      new Error("db")
    );
    expect(
      (
        await reuseAsset(
          request(`/api/assets/${assetId}/reuse`, { method: "POST" }),
          params
        )
      ).status
    ).toBe(500);
  });

  it("allows an editor to reuse a draft", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue({
      id: assetId,
      projectId: "project_1",
      status: "DRAFT",
    });
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue({ reuseCount: 1 });

    const response = await reuseAsset(
      request(`/api/assets/${assetId}/reuse`, { method: "POST" }),
      params
    );
    expect(response.status).toBe(200);
  });

  it("rejects invalid runtime PATCH field types", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset);
    const response = await updateAsset(
      request(`/api/assets/${assetId}`, {
        method: "PATCH",
        body: JSON.stringify({ rootCauseText: 123 }),
      }),
      { params: Promise.resolve({ id: assetId }) }
    );

    expect(response.status).toBe(400);
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const response = await GET(new NextRequest("http://localhost/api/assets"));
    expect(response.status).toBe(401);

    expect(
      (
        await getAsset(new NextRequest(`http://localhost/api/assets/${assetId}`), params)
      ).status
    ).toBe(401);
    expect(
      (
        await updateAsset(
          new NextRequest(`http://localhost/api/assets/${assetId}`, {
            method: "PATCH",
          }),
          params
        )
      ).status
    ).toBe(401);
    expect(
      (
        await reuseAsset(
          new NextRequest(`http://localhost/api/assets/${assetId}/reuse`, {
            method: "POST",
          }),
          params
        )
      ).status
    ).toBe(401);
  });
});
