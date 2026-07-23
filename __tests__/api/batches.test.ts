import { GET as getBatches, POST as createBatch } from "@/app/api/stages/[id]/batches/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
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
  });

  it("should return batches with zero pass/fail counts when groupBy has no entry for the batch", async () => {
    (mockPrisma.testStage.findUnique as jest.Mock).mockResolvedValue({ id: "s1" });
    (mockPrisma.batchScope.findMany as jest.Mock).mockResolvedValue([
      {
        id: "b2",
        projectId: "p1",
        testStageId: "s1",
        name: "Batch-2",
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
