import { GET as getStages, POST as createStage } from "@/app/api/projects/[id]/stages/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
    testStage: {
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

describe("GET /api/projects/[id]/stages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth for GET", async () => {
    const req = createRequest("/api/projects/p1/stages");
    const params = Promise.resolve({ id: "p1" });
    const res = await getStages(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 404 if project not found", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/projects/nonexistent/stages");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "nonexistent" });
    const res = await getStages(req, { params });
    expect(res.status).toBe(404);
  });

  it("should return stages for a project", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    (mockPrisma.testStage.findMany as jest.Mock).mockResolvedValue([
      {
        id: "s1",
        projectId: "p1",
        name: "SIT-1",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        _count: { batches: 1, cases: 5 },
      },
    ]);
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([{ testStageId: "s1", _count: { _all: 4 } }])
      .mockResolvedValueOnce([{ testStageId: "s1", _count: { _all: 1 } }]);

    const req = createRequest("/api/projects/p1/stages");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "p1" });
    const res = await getStages(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stages).toHaveLength(1);
    expect(body.stages[0].name).toBe("SIT-1");
  });

  it("should return stages with zero pass/fail counts when groupBy has no entry for the stage", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    (mockPrisma.testStage.findMany as jest.Mock).mockResolvedValue([
      {
        id: "s2",
        projectId: "p1",
        name: "SIT-2",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        _count: { batches: 0, cases: 0 },
      },
    ]);
    // No groupBy entries for stage s2 → triggers Map.get() ?? 0 fallback
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([]) // passCounts
      .mockResolvedValueOnce([]); // failCounts

    const req = createRequest("/api/projects/p1/stages");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "p1" });
    const res = await getStages(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stages).toHaveLength(1);
    expect(body.stages[0].passCount).toBe(0);
    expect(body.stages[0].failCount).toBe(0);
  });
});

describe("POST /api/projects/[id]/stages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth for POST", async () => {
    const req = createRequest("/api/projects/p1/stages", {
      method: "POST",
      body: JSON.stringify({ name: "SIT-2" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ id: "p1" });
    const res = await createStage(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 400 if name is missing", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    const req = createRequest("/api/projects/p1/stages", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "p1" });
    const res = await createStage(req, { params });
    expect(res.status).toBe(400);
  });

  it("should create a stage and return it", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    const created = {
      id: "s2",
      projectId: "p1",
      name: "SIT-2",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    (mockPrisma.testStage.create as jest.Mock).mockResolvedValue(created);
    const req = createRequest("/api/projects/p1/stages", {
      method: "POST",
      body: JSON.stringify({ name: "SIT-2" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "p1" });
    const res = await createStage(req, { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.stage.name).toBe("SIT-2");
  });

  it("should return 500 on DB error for GET", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));
    const req = createRequest("/api/projects/p1/stages");
    req.headers.set("cookie", authCookie());
    const params = Promise.resolve({ id: "p1" });
    const res = await getStages(req, { params });
    expect(res.status).toBe(500);
  });

  it("should return 404 if project not found for POST", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/projects/p1/stages", {
      method: "POST",
      body: JSON.stringify({ name: "SIT-3" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "p1" });
    const res = await createStage(req, { params });
    expect(res.status).toBe(404);
  });

  it("should return 409 on P2002 error for POST", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    const error = new Error("Unique constraint failed");
    (error as Error & { code: string }).code = "P2002";
    (mockPrisma.testStage.create as jest.Mock).mockRejectedValue(error);
    const req = createRequest("/api/projects/p1/stages", {
      method: "POST",
      body: JSON.stringify({ name: "SIT-2" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "p1" });
    const res = await createStage(req, { params });
    expect(res.status).toBe(409);
  });

  it("should return 500 on non-P2002 error for POST", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    (mockPrisma.testStage.create as jest.Mock).mockRejectedValue(new Error("Generic error"));
    const req = createRequest("/api/projects/p1/stages", {
      method: "POST",
      body: JSON.stringify({ name: "SIT-3" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const params = Promise.resolve({ id: "p1" });
    const res = await createStage(req, { params });
    expect(res.status).toBe(500);
  });

  it("should return 401 without auth for GET", async () => {
    const req = createRequest("/api/projects/p1/stages");
    const params = Promise.resolve({ id: "p1" });
    const res = await getStages(req, { params });
    expect(res.status).toBe(401);
  });

  it("should return 401 without auth for POST", async () => {
    const req = createRequest("/api/projects/p1/stages", {
      method: "POST",
      body: JSON.stringify({ name: "SIT-3" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ id: "p1" });
    const res = await createStage(req, { params });
    expect(res.status).toBe(401);
  });
});
