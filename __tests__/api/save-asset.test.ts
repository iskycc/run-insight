import { PATCH as saveAsset } from "@/app/api/cases/[id]/save-asset/route";
import { POST as batchSaveAsset } from "@/app/api/cases/batch-save-asset/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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

const caseWithProgress = {
  id: validId,
  caseNo: "TC-001",
  name: "测试用例1",
  resultSummary: "FAIL",
  logUrl: null,
  projectId: "p1",
  testStageId: "s1",
  batchScopeId: "b1",
  assignee: "张三",
  progressCategory: "LOCATED",
  rootCause: "代码缺陷",
  mrOrTicket: null,
  assetSaved: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("PATCH /api/cases/[id]/save-asset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth", async () => {
    const req = createRequest(`/api/cases/${validId}/save-asset`, { method: "PATCH" });
    const params = Promise.resolve({ id: validId });
    const res = await saveAsset(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 400 for invalid cuid", async () => {
    const req = createRequest("/api/cases/invalid-id/save-asset", { method: "PATCH" });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "invalid-id" });
    const res = await saveAsset(req, { params });
    expect(res.status).toBe(400);
  });

  it("should return 404 when case not found", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(null);

    const req = createRequest(`/api/cases/${validId}/save-asset`, { method: "PATCH" });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await saveAsset(req, { params });
    expect(res.status).toBe(404);
  });

  it("should return 400 when case has no progressCategory", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue({
      ...caseWithProgress,
      progressCategory: null,
    });

    const req = createRequest(`/api/cases/${validId}/save-asset`, { method: "PATCH" });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await saveAsset(req, { params });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("进展分类");
  });

  it("should return 400 when case already saved as asset", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue({
      ...caseWithProgress,
      assetSaved: true,
    });

    const req = createRequest(`/api/cases/${validId}/save-asset`, { method: "PATCH" });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await saveAsset(req, { params });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("已保存");
  });

  it("should successfully mark case as assetSaved", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(caseWithProgress);
    (mockPrisma.caseResult.update as jest.Mock).mockResolvedValue({
      ...caseWithProgress,
      assetSaved: true,
    });

    const req = createRequest(`/api/cases/${validId}/save-asset`, { method: "PATCH" });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await saveAsset(req, { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.case.assetSaved).toBe(true);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest(`/api/cases/${validId}/save-asset`, { method: "PATCH" });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await saveAsset(req, { params });
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("INTERNAL_ERROR");
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest(`/api/cases/${validId}/save-asset`, { method: "PATCH" });
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: validId });
    const res = await saveAsset(req, { params });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/cases/batch-save-asset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth", async () => {
    const req = createRequest("/api/cases/batch-save-asset", {
      method: "POST",
      body: JSON.stringify({ caseIds: [validId] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await batchSaveAsset(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 for empty caseIds", async () => {
    const req = createRequest("/api/cases/batch-save-asset", {
      method: "POST",
      body: JSON.stringify({ caseIds: [] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await batchSaveAsset(req);
    expect(res.status).toBe(400);
  });

  it("should return 400 for missing caseIds", async () => {
    const req = createRequest("/api/cases/batch-save-asset", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await batchSaveAsset(req);
    expect(res.status).toBe(400);
  });

  it("should batch save assets successfully", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

    const req = createRequest("/api/cases/batch-save-asset", {
      method: "POST",
      body: JSON.stringify({ caseIds: [validId, "id2", "id3"] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await batchSaveAsset(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.updated).toBe(3);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/cases/batch-save-asset", {
      method: "POST",
      body: JSON.stringify({ caseIds: [validId] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await batchSaveAsset(req);
    expect(res.status).toBe(500);
  });
});
