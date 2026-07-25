import { GET, PATCH } from "@/app/api/cases/[id]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    projectMember: { findUnique: jest.fn() },
    rootCauseCategory: { findUnique: jest.fn() },
    caseActivity: { create: jest.fn() },
    caseResult: {
      findUnique: jest.fn(),
      update: jest.fn(),
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

const validId = "clxxxxxxxxxxxxxxxxxxxxxx1";
const sampleCase = {
  id: validId,
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
  notes: null,
  assetSaved: false,
  updatedBy: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const sampleCaseWithRelations = {
  ...sampleCase,
  project: { id: "p1", name: "项目1" },
  stage: { id: "s1", name: "阶段1" },
  batchScope: { id: "b1", name: "批跑1" },
  updater: { username: "analyst" },
};

describe("GET /api/cases/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("should return 401 without auth", async () => {
    const req = createRequest(`/api/cases/${validId}`);
    const params = Promise.resolve({ id: validId });
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 400 for invalid cuid", async () => {
    const req = createRequest("/api/cases/invalid-id");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "invalid-id" });
    const res = await GET(req, { params });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("should return 404 when case not found", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(null);

    const req = createRequest(`/api/cases/${validId}`);
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it("should return case with project, stage, batch names", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCaseWithRelations);

    const req = createRequest(`/api/cases/${validId}`);
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.case.caseNo).toBe("TC-001");
    expect(body.case.project.name).toBe("项目1");
    expect(body.case.stage.name).toBe("阶段1");
    expect(body.case.batchScope.name).toBe("批跑1");
    expect(body.case.updatedByUsername).toBe("analyst");
    expect(mockPrisma.caseResult.findUnique).toHaveBeenCalledWith({
      where: { id: validId },
      include: {
        project: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
        batchScope: { select: { id: true, name: true } },
        updater: { select: { username: true } },
        rootCauseCategory: { select: { id: true, name: true } },
      },
    });
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest(`/api/cases/${validId}`);
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await GET(req, { params });
    expect(res.status).toBe(500);
  });

  it("returns a null updater name when no updater is associated", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue({
      ...sampleCaseWithRelations,
      updater: null,
    });
    const req = createRequest(`/api/cases/${validId}`);
    req.headers.set("cookie", authCookie());

    const res = await GET(req, { params: Promise.resolve({ id: validId }) });

    expect((await res.json()).case.updatedByUsername).toBeNull();
  });

  it("denies case details to a user outside the project", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCaseWithRelations);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest(`/api/cases/${validId}`);
    req.headers.set("cookie", authCookie());

    expect((await GET(req, { params: Promise.resolve({ id: validId }) })).status).toBe(403);
  });
});

describe("PATCH /api/cases/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("should return 401 without auth", async () => {
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ assignee: "张三" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 400 for invalid cuid", async () => {
    const req = createRequest("/api/cases/invalid-id", {
      method: "PATCH",
      body: JSON.stringify({ assignee: "张三" }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "invalid-id" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });

  it("should return 404 when case not found", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(null);

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ assignee: "张三" }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(404);
  });

  it("should update case fields", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue({
      ...sampleCase,
      assignee: "张三",
      progressCategory: "LOCATED",
    });

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ assignee: "张三", progressCategory: "LOCATED" }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.case.assignee).toBe("张三");
  });

  it("should update notes and return the authenticated updater name", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue({
      ...sampleCase,
      notes: "补充分析结论",
      updatedBy: "user_1",
    });

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: "补充分析结论" }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect((mockPrisma.caseResult.update as jest.Mock).mock.calls[0][0].data.notes)
      .toBe("补充分析结论");
    expect(body.case.notes).toBe("补充分析结论");
    expect(body.case.updatedByUsername).toBe("admin");
  });

  it("should update case with empty body (no update fields)", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue(sampleCase);

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);

    const updateCall = (mockPrisma.caseResult.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).toEqual({ updatedBy: "user_1" });
  });

  it("should update case with only some fields (partial update)", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue({
      ...sampleCase,
      rootCause: "代码缺陷",
      mrOrTicket: "MR-456",
    });

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ rootCause: "代码缺陷", mrOrTicket: "MR-456" }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);

    const updateCall = (mockPrisma.caseResult.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.rootCause).toBe("代码缺陷");
    expect(updateCall.data.mrOrTicket).toBe("MR-456");
    expect(updateCall.data.updatedBy).toBe("user_1");
    expect(updateCall.data.assignee).toBeUndefined();
    expect(updateCall.data.progressCategory).toBeUndefined();
    expect(updateCall.data.assetSaved).toBeUndefined();
  });

  it("should update assetSaved field", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue({
      ...sampleCase,
      assetSaved: true,
    });

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ assetSaved: true }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);

    const updateCall = (mockPrisma.caseResult.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.assetSaved).toBe(true);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ assignee: "张三" }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(500);
  });

  it("should update case with assetSaved field", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue({
      ...sampleCase,
      assetSaved: true,
    });

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ assetSaved: true }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);

    const updateCall = (mockPrisma.caseResult.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.assetSaved).toBe(true);
  });

  it("should return 400 for invalid progressCategory", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ progressCategory: "INVALID" }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("should accept valid progressCategory", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue({
      ...sampleCase,
      progressCategory: "LOCATED",
    });

    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ progressCategory: "LOCATED" }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);

    const updateCall = (mockPrisma.caseResult.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.progressCategory).toBe("LOCATED");
  });

  it("should return 400 for rootCause exceeding 200 characters", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);

    const longRootCause = "a".repeat(201);
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ rootCause: longRootCause }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("denies editing to a project viewer", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ priority: "HIGH" }),
    });
    req.headers.set("cookie", authCookie());

    expect((await PATCH(req, { params: Promise.resolve({ id: validId }) })).status).toBe(403);
  });

  it.each([
    [{ assigneeId: 123 }, "责任人"],
    [{ priority: "URGENT" }, "优先级"],
    [{ dueDate: "bad-date" }, "截止日期"],
    [{ rootCauseCategoryId: 123 }, "根因分类"],
    [{ mrOrTicket: "m".repeat(201) }, "MR/单号"],
    [{ notes: "n".repeat(5001) }, "备注"],
  ])("rejects invalid detail field %#", async (body, message) => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    req.headers.set("cookie", authCookie());

    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain(message);
  });

  it("rejects an assignee who is not a project member", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ assigneeId: "u2" }),
    });
    req.headers.set("cookie", authCookie());

    expect((await PATCH(req, { params: Promise.resolve({ id: validId }) })).status).toBe(400);
  });

  it("sets an assignee and records date-aware changes in one transaction", async () => {
    const current = {
      ...sampleCase,
      assigneeId: null,
      priority: null,
      dueDate: new Date("2026-07-01"),
      rootCauseCategoryId: null,
    };
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(current);
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      user: { username: "bob" },
    });
    (mockPrisma.caseResult.update as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...current, ...data }),
    );
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({
        assigneeId: "u2",
        priority: "HIGH",
        dueDate: "2026-08-01",
      }),
    });
    req.headers.set("cookie", authCookie());

    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    const activity = (mockPrisma.caseActivity.create as jest.Mock).mock.calls[0][0];

    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(activity.data.changes.dueDate).toEqual({
      from: new Date("2026-07-01").toISOString(),
      to: new Date("2026-08-01").toISOString(),
    });
    expect((mockPrisma.caseResult.update as jest.Mock).mock.calls[0][0].data.assignee)
      .toBe("bob");
  });

  it("clears optional assignment, category and due-date fields", async () => {
    const current = {
      ...sampleCase,
      assigneeId: "u2",
      priority: "HIGH",
      dueDate: new Date("2026-08-01"),
      rootCauseCategoryId: "rc1",
    };
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(current);
    (mockPrisma.caseResult.update as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...current, ...data }),
    );
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({
        assigneeId: null,
        priority: null,
        dueDate: null,
        rootCauseCategoryId: "",
      }),
    });
    req.headers.set("cookie", authCookie());

    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    const data = (mockPrisma.caseResult.update as jest.Mock).mock.calls[0][0].data;

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      assigneeId: null,
      assignee: null,
      priority: null,
      dueDate: null,
      rootCauseCategoryId: null,
    });
  });

  it("accepts a global or same-project active root-cause category", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue({
      id: "rc1",
      archived: false,
      projectId: null,
    });
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue({
      ...sampleCase,
      rootCauseCategoryId: "rc1",
    });
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ rootCauseCategoryId: "rc1" }),
    });
    req.headers.set("cookie", authCookie());

    expect((await PATCH(req, { params: Promise.resolve({ id: validId }) })).status).toBe(200);
  });

  it.each([
    null,
    { id: "rc1", archived: true, projectId: null },
    { id: "rc1", archived: false, projectId: "p2" },
  ])("rejects an unavailable root-cause category %#", async (category) => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(sampleCase);
    (mockPrisma.rootCauseCategory.findUnique as jest.Mock).mockResolvedValue(category);
    const req = createRequest(`/api/cases/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ rootCauseCategoryId: "rc1" }),
    });
    req.headers.set("cookie", authCookie());

    expect((await PATCH(req, { params: Promise.resolve({ id: validId }) })).status).toBe(400);
  });
});
