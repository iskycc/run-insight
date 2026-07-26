import { GET as getBatches, POST as createBatch } from "@/app/api/stages/[id]/batches/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    testStage: {
      findUnique: jest.fn(),
    },
    batchScope: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    caseResult: {
      groupBy: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}));

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

describe("GET /api/stages/[id]/batches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth for GET", async () => {
    const req = createRequest("/api/stages/s1/batches");
    const params = Promise.resolve({ id: "s1" });
    const res = await getBatches(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 404 if stage not found", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/stages/nonexistent/batches");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "nonexistent" });
    const res = await getBatches(req, { params });
    expect(res.status).toBe(404);
  });

  it("should return batches for a stage", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({ id: "s1" });
    (mockPrisma.batchScope.findMany as jest.Mock).mockResolvedValue([
      {
        id: "b1",
        projectId: "p1",
        testStageId: "s1",
        name: "Batch-1",
        archived: false,
        executedAt: new Date("2026-01-01"),
        startedAt: null,
        finishedAt: null,
        environment: "SIT",
        buildVersion: "v1",
        commitSha: null,
        pipelineUrl: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        _count: { cases: 10 },
      },
    ]);
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([{ batchScopeId: "b1", _count: { _all: 8 } }])
      .mockResolvedValueOnce([{ batchScopeId: "b1", _count: { _all: 2 } }]);

    const req = createRequest("/api/stages/s1/batches");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "s1" });
    const res = await getBatches(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batches).toHaveLength(1);
    expect(body.batches[0].name).toBe("Batch-1");
    expect(mockPrisma.batchScope.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  it("returns an empty list without running aggregate queries", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    (mockPrisma.batchScope.findMany as jest.Mock).mockResolvedValue([]);
    const req = createRequest("/api/stages/s1/batches", {
      headers: { cookie: authCookie() },
    });

    const res = await getBatches(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ batches: [] });
    expect(mockPrisma.caseResult.groupBy).not.toHaveBeenCalled();
  });

  it("should return batches with zero pass/fail counts when groupBy has no entry for the batch", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({ id: "s1" });
    (mockPrisma.batchScope.findMany as jest.Mock).mockResolvedValue([
      {
        id: "b2",
        projectId: "p1",
        testStageId: "s1",
        name: "Batch-2",
        archived: false,
        executedAt: new Date("2026-01-01"),
        startedAt: null,
        finishedAt: null,
        environment: null,
        buildVersion: null,
        commitSha: null,
        pipelineUrl: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        _count: { cases: 0 },
      },
    ]);
    // No groupBy entries for batch b2 → triggers Map.get() ?? 0 fallback
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([]) // passCounts
      .mockResolvedValueOnce([]); // failCounts

    const req = createRequest("/api/stages/s1/batches");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "s1" });
    const res = await getBatches(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batches).toHaveLength(1);
    expect(body.batches[0].passCount).toBe(0);
    expect(body.batches[0].failCount).toBe(0);
  });
});

describe("POST /api/stages/[id]/batches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth for POST", async () => {
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({ name: "Batch-2" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ id: "s1" });
    const res = await createBatch(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 400 if name is missing", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({ id: "s1" });
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "s1" });
    const res = await createBatch(req, { params });
    expect(res.status).toBe(400);
  });

  it("should create a batch and return it", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    const created = {
      id: "b2",
      projectId: "p1",
      testStageId: "s1",
      name: "Batch-2",
      archived: false,
      executedAt: new Date("2026-01-01"),
      startedAt: null,
      finishedAt: null,
      environment: null,
      buildVersion: null,
      commitSha: null,
      pipelineUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    (mockPrisma.batchScope.create as jest.Mock).mockResolvedValue(created);
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({ name: "Batch-2" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "s1" });
    const res = await createBatch(req, { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.batch.name).toBe("Batch-2");
  });

  it("should persist execution metadata when creating a batch", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    const executedAt = new Date("2026-07-26T02:30:00.000Z");
    (mockPrisma.batchScope.create as jest.Mock).mockResolvedValue({
      id: "b3",
      projectId: "p1",
      testStageId: "s1",
      name: "Release 2.1",
      archived: false,
      executedAt,
      startedAt: null,
      finishedAt: null,
      environment: "SIT",
      buildVersion: "2.1.0",
      commitSha: "abcdef1",
      pipelineUrl: "https://ci.example.com/pipelines/42",
      createdAt: executedAt,
      updatedAt: executedAt,
    });

    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({
        name: "Release 2.1",
        executedAt: executedAt.toISOString(),
        environment: "SIT",
        buildVersion: "2.1.0",
        commitSha: "abcdef1",
        pipelineUrl: "https://ci.example.com/pipelines/42",
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await createBatch(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(201);
    expect(mockPrisma.batchScope.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executedAt,
        environment: "SIT",
        buildVersion: "2.1.0",
        commitSha: "abcdef1",
        pipelineUrl: "https://ci.example.com/pipelines/42",
      }),
    });
    const body = await res.json();
    expect(body.batch.executedAt).toBe(executedAt.toISOString());
  });

  it("normalizes timezone-aware dates and optional whitespace", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    const executedAt = new Date("2026-07-26T02:30:00.000Z");
    const startedAt = new Date("2026-07-26T02:00:00.000Z");
    const finishedAt = new Date("2026-07-26T03:00:00.000Z");
    (mockPrisma.batchScope.create as jest.Mock).mockResolvedValue({
      id: "b4",
      projectId: "p1",
      testStageId: "s1",
      name: "Release 2.2",
      archived: false,
      executedAt,
      startedAt,
      finishedAt,
      environment: null,
      buildVersion: null,
      commitSha: "abcdef1",
      pipelineUrl: "https://ci.example.com/jobs/7",
      createdAt: executedAt,
      updatedAt: executedAt,
    });
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({
        name: "Release 2.2",
        executedAt: "2026-07-26T10:30:00+08:00",
        startedAt: "2026-07-26T10:00:00+08:00",
        finishedAt: "2026-07-26T11:00:00+08:00",
        environment: "   ",
        commitSha: "abcdef1",
        pipelineUrl: "  https://ci.example.com/jobs/7  ",
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await createBatch(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(201);
    expect(mockPrisma.batchScope.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executedAt,
        startedAt,
        finishedAt,
        environment: null,
        pipelineUrl: "https://ci.example.com/jobs/7",
      }),
    });
  });

  it.each([
    [{ name: "   " }, "批跑名称格式不正确"],
    [{ name: "Batch invalid", executedAt: "" }, "执行时间不能为空"],
    [
      { name: "Batch invalid", executedAt: "2026-07-26T10:00:00" },
      "执行时间格式不正确，必须包含时区",
    ],
    [
      { name: "Batch invalid", executedAt: "2026-02-30T10:00:00Z" },
      "执行时间格式不正确，必须包含时区",
    ],
    [{ name: "Batch invalid", commitSha: "not-sha" }, "Commit SHA 格式不正确"],
    [
      { name: "Batch invalid", pipelineUrl: "javascript:alert(1)" },
      "日志链接必须为 HTTP/HTTPS 链接",
    ],
  ])("rejects invalid execution metadata %#", async (payload, message) => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await createBatch(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message,
    });
    expect(mockPrisma.batchScope.create).not.toHaveBeenCalled();
  });

  it("rejects a non-object request body", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: "null",
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await createBatch(req, { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(400);
    expect(mockPrisma.batchScope.create).not.toHaveBeenCalled();
  });

  it("should return 500 on DB error for GET", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));
    const req = createRequest("/api/stages/s1/batches");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "s1" });
    const res = await getBatches(req, { params });
    expect(res.status).toBe(500);
  });

  it("should return 404 if stage not found for POST", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({ name: "Batch-3" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "s1" });
    const res = await createBatch(req, { params });
    expect(res.status).toBe(404);
  });

  it("should return 409 on P2002 error for POST", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    const error = new Error("Unique constraint failed");
    (error as Error & { code: string }).code = "P2002";
    (mockPrisma.batchScope.create as jest.Mock).mockRejectedValue(error);
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({ name: "Batch-2" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "s1" });
    const res = await createBatch(req, { params });
    expect(res.status).toBe(409);
  });

  it("should return 500 on non-P2002 error for POST", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      projectId: "p1",
    });
    (mockPrisma.batchScope.create as jest.Mock).mockRejectedValue(new Error("Generic error"));
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({ name: "Batch-3" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "s1" });
    const res = await createBatch(req, { params });
    expect(res.status).toBe(500);
  });

  it("should return 401 without auth for GET", async () => {
    const req = createRequest("/api/stages/s1/batches");
    const params = Promise.resolve({ id: "s1" });
    const res = await getBatches(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 401 without auth for POST", async () => {
    const req = createRequest("/api/stages/s1/batches", {
      method: "POST",
      body: JSON.stringify({ name: "Batch-3" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ id: "s1" });
    const res = await createBatch(req, { params });
    expect(res.status).toBe(401);
  });
});
