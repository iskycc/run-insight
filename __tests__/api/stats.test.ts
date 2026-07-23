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

describe("GET /api/stats/dashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return dashboard stats with counts and progressDistribution", async () => {
    (mockPrisma.project.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.testStage.count as jest.Mock).mockResolvedValue(3);
    (mockPrisma.batchScope.count as jest.Mock).mockResolvedValue(5);
    (mockPrisma.caseResult.count as jest.Mock)
      .mockResolvedValueOnce(100)   // totalCaseCount
      .mockResolvedValueOnce(30)    // failedCaseCount
      .mockResolvedValueOnce(20)    // analyzedCaseCount
      .mockResolvedValueOnce(10);   // assetCount
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
    expect(body.failedCaseCount).toBe(30);
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
    (mockPrisma.caseResult.count as jest.Mock)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
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
    (mockPrisma.caseResult.count as jest.Mock)
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);
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
    (mockPrisma.caseResult.count as jest.Mock)
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
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
    (mockPrisma.caseResult.count as jest.Mock)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
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
        { batchScopeId: "b2", _count: { _all: 12 } },
        { batchScopeId: "b1", _count: { _all: 10 } },
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
    // Return empty groupBy results → triggers Map.get() ?? 0 fallback for total, failed, analyzed
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([]) // totalCounts
      .mockResolvedValueOnce([]) // failedCounts
      .mockResolvedValueOnce([]); // analyzedCounts

    const req = createRequest("/api/stats/trend?limit=10");
    const res = await trendGET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.trends).toHaveLength(1);
    expect(body.trends[0].total).toBe(0);
    expect(body.trends[0].failed).toBe(0);
    expect(body.trends[0].analyzed).toBe(0);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.batchScope.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/stats/trend");
    const res = await trendGET(req);
    expect(res.status).toBe(500);
  });
});
