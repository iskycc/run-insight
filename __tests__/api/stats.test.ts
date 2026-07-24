import { GET as dashboardGET } from "@/app/api/stats/dashboard/route";
import { GET as trendGET } from "@/app/api/stats/trend/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: { count: jest.fn() },
    testStage: { count: jest.fn() },
    batchScope: { findMany: jest.fn(), count: jest.fn() },
    caseResult: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), options as RequestInit);
}

function mockDashboardCaseCounts({
  total,
  passed = 0,
  failed = 0,
  blocked = 0,
  skipped = 0,
  analyzed = 0,
  assets = 0,
}: {
  total: number;
  passed?: number;
  failed?: number;
  blocked?: number;
  skipped?: number;
  analyzed?: number;
  assets?: number;
}) {
  (mockPrisma.caseResult.count as jest.Mock)
    .mockResolvedValueOnce(total)
    .mockResolvedValueOnce(passed)
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(blocked)
    .mockResolvedValueOnce(skipped)
    .mockResolvedValueOnce(analyzed)
    .mockResolvedValueOnce(assets);
}

describe("GET /api/stats/dashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return dashboard stats with counts and progressDistribution", async () => {
    (mockPrisma.project.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.testStage.count as jest.Mock).mockResolvedValue(3);
    (mockPrisma.batchScope.count as jest.Mock).mockResolvedValue(5);
    mockDashboardCaseCounts({
      total: 100,
      passed: 55,
      failed: 30,
      blocked: 5,
      skipped: 10,
      analyzed: 20,
      assets: 10,
    });
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([
      { progressCategory: "LOCATED", _count: { _all: 10 } },
      { progressCategory: "FIXED", _count: { _all: 8 } },
    ]);

    const req = createRequest("/api/stats/dashboard");
    const res = await dashboardGET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.projectCount).toBe(2);
    expect(body.testStageCount).toBe(3);
    expect(body.batchScopeCount).toBe(5);
    expect(body.totalCaseCount).toBe(100);
    expect(body.passedCaseCount).toBe(55);
    expect(body.failedCaseCount).toBe(30);
    expect(body.blockedCaseCount).toBe(5);
    expect(body.skippedCaseCount).toBe(10);
    expect(body.passRate).toBe(55);
    expect(body.failRate).toBe(30);
    expect(body.analyzedCaseCount).toBe(20);
    expect(body.assetCount).toBe(10);
    expect(body.progressDistribution).toHaveLength(2);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.project.count as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/stats/dashboard");
    const res = await dashboardGET(req);
    expect(res.status).toBe(500);
  });

  it("should pass projectId filter to where clause and project count", async () => {
    (mockPrisma.project.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.testStage.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.batchScope.count as jest.Mock).mockResolvedValue(3);
    mockDashboardCaseCounts({ total: 50, passed: 35, failed: 10, analyzed: 5, assets: 2 });
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/stats/dashboard?projectId=p1");
    const res = await dashboardGET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.projectCount).toBe(1);

    // Verify project.count was called with projectId filter
    const projectCountCalls = (mockPrisma.project.count as jest.Mock).mock.calls;
    expect(projectCountCalls[0][0]).toEqual({ where: { id: "p1" } });

    // Verify caseResult.count first call (totalCaseCount) has projectId in where
    const caseCountFirstCall = (mockPrisma.caseResult.count as jest.Mock).mock.calls[0][0];
    expect(caseCountFirstCall.where.projectId).toBe("p1");
  });

  it("should pass testStageId filter to where clause", async () => {
    (mockPrisma.project.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.testStage.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.batchScope.count as jest.Mock).mockResolvedValue(3);
    mockDashboardCaseCounts({ total: 40, passed: 24, failed: 8, analyzed: 4, assets: 1 });
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/stats/dashboard?testStageId=s1");
    const res = await dashboardGET(req);
    expect(res.status).toBe(200);

    // testStage.count should be called with id filter
    const testStageCountCalls = (mockPrisma.testStage.count as jest.Mock).mock.calls;
    expect(testStageCountCalls[0][0]).toEqual({ where: { id: "s1" } });

    // batchScope.count should be called with testStageId filter
    const batchScopeCountCalls = (mockPrisma.batchScope.count as jest.Mock).mock.calls;
    expect(batchScopeCountCalls[0][0]).toEqual({ where: { testStageId: "s1" } });

    // caseResult.count first call should have testStageId in where
    const caseCountFirstCall = (mockPrisma.caseResult.count as jest.Mock).mock.calls[0][0];
    expect(caseCountFirstCall.where.testStageId).toBe("s1");
  });

  it("should pass batchScopeId filter to where clause", async () => {
    (mockPrisma.project.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.testStage.count as jest.Mock).mockResolvedValue(3);
    (mockPrisma.batchScope.count as jest.Mock).mockResolvedValue(1);
    mockDashboardCaseCounts({ total: 30, passed: 20, failed: 5, analyzed: 2 });
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/stats/dashboard?batchScopeId=b1");
    const res = await dashboardGET(req);
    expect(res.status).toBe(200);

    // batchScope.count should be called with id filter
    const batchScopeCountCalls = (mockPrisma.batchScope.count as jest.Mock).mock.calls;
    expect(batchScopeCountCalls[0][0]).toEqual({ where: { id: "b1" } });

    // caseResult.count first call should have batchScopeId in where
    const caseCountFirstCall = (mockPrisma.caseResult.count as jest.Mock).mock.calls[0][0];
    expect(caseCountFirstCall.where.batchScopeId).toBe("b1");
  });

  it("should pass multiple filters to where clause", async () => {
    (mockPrisma.project.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.testStage.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.batchScope.count as jest.Mock).mockResolvedValue(1);
    mockDashboardCaseCounts({ total: 20, passed: 15, failed: 3, analyzed: 1 });
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/stats/dashboard?projectId=p1&testStageId=s1&batchScopeId=b1");
    const res = await dashboardGET(req);
    expect(res.status).toBe(200);

    // caseResult.count first call should have all three filters in where
    const caseCountFirstCall = (mockPrisma.caseResult.count as jest.Mock).mock.calls[0][0];
    expect(caseCountFirstCall.where.projectId).toBe("p1");
    expect(caseCountFirstCall.where.testStageId).toBe("s1");
    expect(caseCountFirstCall.where.batchScopeId).toBe("b1");
  });
});

describe("GET /api/stats/trend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return trend data with limit", async () => {
    // findMany with orderBy desc returns newest first: Batch2 (Jan 2), then Batch1 (Jan 1)
    const batches = [
      { id: "b2", name: "Batch2", createdAt: new Date("2026-01-02") },
      { id: "b1", name: "Batch1", createdAt: new Date("2026-01-01") },
    ];
    (mockPrisma.batchScope.findMany as jest.Mock).mockResolvedValue(batches);
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { batchScopeId: "b2", _count: { _all: 60 } },
        { batchScopeId: "b1", _count: { _all: 50 } },
      ])
      .mockResolvedValueOnce([
        { batchScopeId: "b2", _count: { _all: 42 } },
        { batchScopeId: "b1", _count: { _all: 35 } },
      ])
      .mockResolvedValueOnce([
        { batchScopeId: "b2", _count: { _all: 12 } },
        { batchScopeId: "b1", _count: { _all: 10 } },
      ])
      .mockResolvedValueOnce([
        { batchScopeId: "b2", _count: { _all: 4 } },
        { batchScopeId: "b1", _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([
        { batchScopeId: "b2", _count: { _all: 2 } },
        { batchScopeId: "b1", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { batchScopeId: "b2", _count: { _all: 8 } },
        { batchScopeId: "b1", _count: { _all: 5 } },
      ]);

    const req = createRequest("/api/stats/trend?limit=10");
    const res = await trendGET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.trends).toHaveLength(2);
    // After reverse(), trends are in chronological order (oldest first)
    expect(body.trends[0].batch).toBe("Batch1");
    expect(body.trends[1].batch).toBe("Batch2");
    expect(body.trends[0].passed).toBe(35);
    expect(body.trends[0].failed).toBe(10);
    expect(body.trends[0].passRate).toBe(70);
    expect(body.trends[0].failRate).toBe(20);
  });

  it("should return empty trends when no batches exist", async () => {
    (mockPrisma.batchScope.findMany as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/stats/trend");
    const res = await trendGET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.trends).toEqual([]);
  });

  it("should return trend data with zero counts when groupBy has no entry for a batch", async () => {
    const batches = [
      { id: "b3", name: "EmptyBatch", createdAt: new Date("2026-01-03") },
    ];
    (mockPrisma.batchScope.findMany as jest.Mock).mockResolvedValue(batches);
    // Return empty groupBy results → triggers Map.get() ?? 0 fallback for all trend fields
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([]) // totalCounts
      .mockResolvedValueOnce([]) // passedCounts
      .mockResolvedValueOnce([]) // failedCounts
      .mockResolvedValueOnce([]) // blockedCounts
      .mockResolvedValueOnce([]) // skippedCounts
      .mockResolvedValueOnce([]); // analyzedCounts

    const req = createRequest("/api/stats/trend?limit=10");
    const res = await trendGET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.trends).toHaveLength(1);
    expect(body.trends[0].total).toBe(0);
    expect(body.trends[0].passed).toBe(0);
    expect(body.trends[0].failed).toBe(0);
    expect(body.trends[0].passRate).toBe(0);
    expect(body.trends[0].failRate).toBe(0);
    expect(body.trends[0].analyzed).toBe(0);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.batchScope.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/stats/trend");
    const res = await trendGET(req);
    expect(res.status).toBe(500);
  });
});
