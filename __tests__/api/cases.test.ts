import { GET, PATCH } from "@/app/api/cases/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    testStage: { findUnique: jest.fn().mockResolvedValue({ projectId: "p1" }) },
    batchScope: {
      findUnique: jest.fn().mockResolvedValue({ projectId: "p1", testStageId: "s1" }),
    },
    projectMember: { findUnique: jest.fn(), findMany: jest.fn() },
    rootCauseCategory: { findUnique: jest.fn() },
    caseActivity: { create: jest.fn() },
    caseResult: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
  );
  return { prisma };
});

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new URL(url, "http://localhost:3000"),
    options as ConstructorParameters<typeof NextRequest>[1],
  );
}

function authCookie(): string {
  const token = generateToken({ userId: "user_1", username: "admin" });
  return `run_insight_token=${token}`;
}

const sampleCase = {
  id: "clxxxxxxxxxxxxxxxxxxxxxx1",
  caseNo: "TC-001",
  name: "测试用例1",
  resultSummary: "FAIL",
  logUrl: null,
  projectId: "p1",
  testStageId: "s1",
  batchScopeId: "b1",
  assignee: null,
  progressCategory: null,
  rootCause: null,
  mrOrTicket: null,
  assetSaved: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("GET /api/cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({ projectId: "p1" });
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      projectId: "p1",
      testStageId: "s1",
    });
  });

  it("should return 401 without auth", async () => {
    const req = createRequest("/api/cases");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should return cases with pagination", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([sampleCase]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(1);

    const req = createRequest("/api/cases");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.cases).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  it("should filter by projectId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?projectId=p1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.projectId).toBe("p1");
  });

  it("should filter by testStageId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?testStageId=s1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.testStageId).toBe("s1");
  });

  it("should filter by batchScopeId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?batchScopeId=b1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.batchScopeId).toBe("b1");
  });

  it("should filter by progressCategory", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?progressCategory=LOCATED");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.progressCategory).toBe("LOCATED");
  });

  it("should filter by assetSaved", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?assetSaved=true");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.assetSaved).toBe(true);
  });

  it("should respect page and pageSize params", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?page=2&pageSize=10");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.skip).toBe(10);
    expect(findManyCall.take).toBe(10);
  });

  it("should pass sortField and sortOrder into orderBy", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?sortField=caseNo&sortOrder=asc");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.orderBy).toEqual({ caseNo: "asc" });
  });

  it("should reject invalid sortField with 400", async () => {
    const req = createRequest("/api/cases?sortField=evil");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("should reject invalid sortOrder with 400", async () => {
    const req = createRequest("/api/cases?sortOrder=sideways");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("should filter by assetSaved=false", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?assetSaved=false");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.assetSaved).toBe(false);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/cases");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("rejects an invalid result summary before querying the user", async () => {
    const req = createRequest("/api/cases?resultSummary=BROKEN");
    req.headers.set("cookie", authCookie());

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a token for a deleted user", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/cases");
    req.headers.set("cookie", authCookie());

    expect((await GET(req)).status).toBe(401);
  });

  it.each([
    ["/api/cases?testStageId=missing", "testStage"],
    ["/api/cases?batchScopeId=missing", "batchScope"],
  ])("returns 404 when a related filter does not exist: %s", async (url, model) => {
    (mockPrisma[model as "testStage" | "batchScope"].findUnique as jest.Mock)
      .mockResolvedValue(null);
    const req = createRequest(url);
    req.headers.set("cookie", authCookie());

    expect((await GET(req)).status).toBe(404);
  });

  it("rejects a stage from another project", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({ projectId: "p2" });
    const req = createRequest("/api/cases?projectId=p1&testStageId=s1");
    req.headers.set("cookie", authCookie());

    expect((await GET(req)).status).toBe(400);
  });

  it.each([
    "/api/cases?projectId=p2&batchScopeId=b1",
    "/api/cases?testStageId=s2&batchScopeId=b1",
  ])("rejects a batch that conflicts with its scope: %s", async (url) => {
    const req = createRequest(url);
    req.headers.set("cookie", authCookie());

    expect((await GET(req)).status).toBe(400);
  });

  it("denies a project that is not visible to a non-member", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/cases?projectId=p1");
    req.headers.set("cookie", authCookie());

    expect((await GET(req)).status).toBe(403);
  });

  it("scopes an unfiltered non-admin query to project memberships", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);
    const req = createRequest(
      "/api/cases?resultSummary=FAIL&dateFrom=2026-01-01&dateTo=2026-01-31&page=0&pageSize=999",
    );
    req.headers.set("cookie", authCookie());

    const res = await GET(req);
    const call = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];

    expect(res.status).toBe(200);
    expect(call.where.project).toEqual({
      members: { some: { userId: "user_1" } },
    });
    expect(call.where.resultSummary).toBe("FAIL");
    expect(call.where.createdAt).toEqual({
      gte: new Date("2026-01-01T00:00:00.000Z"),
      lte: new Date("2026-01-31T23:59:59.999Z"),
    });
    expect(call.skip).toBe(0);
    expect(call.take).toBe(100);
  });
});

describe("PATCH /api/cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (mockPrisma.caseResult.findMany as jest.Mock).mockImplementation(
      ({ where }: { where: { id?: { in?: string[] } } }) =>
        Promise.resolve(
          (where.id?.in ?? []).map((id) => ({
            ...sampleCase,
            id,
            assigneeId: null,
            priority: null,
            dueDate: null,
            rootCauseCategoryId: null,
            notes: null,
            updatedBy: null,
          }))
        )
    );
  });

  it("should return 401 without auth", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"], updates: { assignee: "张三" } }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 if caseIds is missing", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ updates: { assignee: "张三" } }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("should return 400 if caseIds is empty", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ caseIds: [], updates: { assignee: "张三" } }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("should return 400 if updates is empty", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"], updates: {} }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("should batch update cases successfully", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1", "claaaaaaaaaaaaaaaaaaaaaa2"],
        updates: { assignee: "张三", progressCategory: "LOCATED" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.updated).toBe(2);
  });

  it("should batch update with partial fields (some undefined)", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { assignee: "李四" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    // Verify only assignee (and updatedBy) are in the data
    const updateCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.assignee).toBe("李四");
    expect(updateCall.data.updatedBy).toBe("user_1");
    expect(updateCall.data.progressCategory).toBeUndefined();
    expect(updateCall.data.rootCause).toBeUndefined();
    expect(updateCall.data.mrOrTicket).toBeUndefined();
    expect(updateCall.data.assetSaved).toBeUndefined();
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"], updates: { assignee: "张三" } }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });

  it("should batch update with only some update fields", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { rootCause: "代码缺陷", assetSaved: true },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const updateManyCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.data.rootCause).toBe("代码缺陷");
    expect(updateManyCall.data.assetSaved).toBe(true);
    expect(updateManyCall.data.assignee).toBeUndefined();
    expect(updateManyCall.data.progressCategory).toBeUndefined();
    expect(updateManyCall.data.mrOrTicket).toBeUndefined();
  });

  it("should batch update with only assignee field", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { assignee: "李四" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const updateManyCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.data.assignee).toBe("李四");
    expect(updateManyCall.data.updatedBy).toBe("user_1");
    expect(Object.keys(updateManyCall.data)).toHaveLength(2);
  });

  it("should batch update with mrOrTicket field", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { mrOrTicket: "MR-789" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const updateManyCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.data.mrOrTicket).toBe("MR-789");
  });

  it("should batch update with assetSaved field", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { assetSaved: true },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const updateManyCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.data.assetSaved).toBe(true);
  });

  it("should return 400 if caseId is not a valid CUID", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["invalid-id"],
        updates: { assignee: "张三" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("should return 400 if progressCategory is invalid", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { progressCategory: "INVALID_CATEGORY" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("进展分类不合法");
  });

  it("should return 400 if rootCause exceeds maxLength", async () => {
    const longRootCause = "a".repeat(201);
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { rootCause: longRootCause },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("should return 400 if mrOrTicket exceeds maxLength", async () => {
    const longMr = "m".repeat(201);
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { mrOrTicket: longMr },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("returns zero when none of the requested case IDs exist", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { priority: "HIGH" },
      }),
    });
    req.headers.set("cookie", authCookie());

    const res = await PATCH(req);

    await expect(res.json()).resolves.toEqual({ updated: 0 });
    expect(mockPrisma.caseResult.updateMany).not.toHaveBeenCalled();
  });

  it("deduplicates IDs and rejects a cross-project selection without edit access", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      { ...sampleCase, id: "claaaaaaaaaaaaaaaaaaaaaa1", projectId: "p1" },
      { ...sampleCase, id: "claaaaaaaaaaaaaaaaaaaaaa2", projectId: "p2" },
    ]);
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: [
          "claaaaaaaaaaaaaaaaaaaaaa1",
          "claaaaaaaaaaaaaaaaaaaaaa1",
          "claaaaaaaaaaaaaaaaaaaaaa2",
        ],
        updates: { priority: "HIGH" },
      }),
    });
    req.headers.set("cookie", authCookie());

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect((mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0].where.id.in)
      .toHaveLength(2);
  });

  it.each([
    [{ assigneeId: 42 }, "责任人"],
    [{ priority: "URGENT" }, "优先级"],
    [{ dueDate: "not-a-date" }, "截止日期"],
    [{ notes: "n".repeat(5001) }, "备注"],
    [{ rootCauseCategoryId: 42 }, "根因分类"],
  ])("rejects invalid batch field %#", async (updates, message) => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates,
      }),
    });
    req.headers.set("cookie", authCookie());

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain(message);
  });

  it("clears assignee, category and due date fields", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: {
          assigneeId: "",
          rootCauseCategoryId: null,
          dueDate: null,
          priority: null,
        },
      }),
    });
    req.headers.set("cookie", authCookie());

    const res = await PATCH(req);
    const data = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0].data;

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      assigneeId: null,
      assignee: null,
      rootCauseCategoryId: null,
      dueDate: null,
      priority: null,
    });
  });

  it("requires an assignee to belong to every selected project", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      { ...sampleCase, id: "claaaaaaaaaaaaaaaaaaaaaa1", projectId: "p1" },
      { ...sampleCase, id: "claaaaaaaaaaaaaaaaaaaaaa2", projectId: "p2" },
    ]);
    (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([
      { projectId: "p1", user: { username: "bob" } },
    ]);
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1", "claaaaaaaaaaaaaaaaaaaaaa2"],
        updates: { assigneeId: "u2" },
      }),
    });
    req.headers.set("cookie", authCookie());

    expect((await PATCH(req)).status).toBe(400);
  });

  it("resolves a shared assignee and project-compatible root-cause category", async () => {
    (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([
      { projectId: "p1", user: { username: "bob" } },
    ]);
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      id: "rc1",
      archived: false,
      projectId: "p1",
    });
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: {
          assigneeId: "u2",
          rootCauseCategoryId: "rc1",
          dueDate: "2026-08-01",
          notes: "分析完成",
        },
      }),
    });
    req.headers.set("cookie", authCookie());

    const res = await PATCH(req);
    const data = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0].data;

    expect(res.status).toBe(200);
    expect(data.assignee).toBe("bob");
    expect(data.rootCauseCategoryId).toBe("rc1");
    expect(data.dueDate).toEqual(new Date("2026-08-01"));
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.caseActivity.create).toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it.each([
    [null],
    [{ id: "rc1", archived: true, projectId: null }],
    [{ id: "rc1", archived: false, projectId: "p2" }],
  ])("rejects missing, archived, or cross-project root category %#", async (category) => {
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(category);
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { rootCauseCategoryId: "rc1" },
      }),
    });
    req.headers.set("cookie", authCookie());

    expect((await PATCH(req)).status).toBe(400);
  });

  it("does not create a change activity when the submitted value is unchanged", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { assetSaved: false },
      }),
    });
    req.headers.set("cookie", authCookie());

    expect((await PATCH(req)).status).toBe(200);
    expect(mockPrisma.caseActivity.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
