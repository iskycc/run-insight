import { GET, PATCH } from "@/app/api/cases/[id]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), options as RequestInit);
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
  assetSaved: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const sampleCaseWithRelations = {
  ...sampleCase,
  project: { id: "p1", name: "项目1" },
  stage: { id: "s1", name: "阶段1" },
  batchScope: { id: "b1", name: "批跑1" },
};

describe("GET /api/cases/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest(`/api/cases/${validId}`);
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await GET(req, { params });
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/cases/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(updateCall.data).toEqual({});
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
});
