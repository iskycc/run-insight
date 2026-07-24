import { GET } from "@/app/api/stats/dashboard/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: { count: jest.fn() },
    testStage: { count: jest.fn() },
    batchScope: { count: jest.fn() },
    caseResult: { count: jest.fn(), groupBy: jest.fn() },
  },
}));

function buildRequest(url: string) {
  return { url: `http://localhost${url}`, headers: new Headers() } as unknown as Request;
}

describe("GET /api/stats/dashboard - date filtering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.project.count as jest.Mock).mockResolvedValue(3);
    (prisma.testStage.count as jest.Mock).mockResolvedValue(6);
    (prisma.batchScope.count as jest.Mock).mockResolvedValue(12);
    (prisma.caseResult.count as jest.Mock)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(60)
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(10);
    (prisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);
  });

  it("should pass startDate and endDate to case count queries", async () => {
    const req = buildRequest("/api/stats/dashboard?startDate=2026-07-01&endDate=2026-07-31");
    await GET(req as any);

    const calls = (prisma.caseResult.count as jest.Mock).mock.calls;
    const dateFilteredCalls = calls.filter((call: any) => {
      const where = call[0]?.where;
      return where?.createdAt !== undefined;
    });
    expect(dateFilteredCalls.length).toBeGreaterThan(0);
  });

  it("should work without date params", async () => {
    const req = buildRequest("/api/stats/dashboard");
    const response = await GET(req as any);
    const body = await response.json();
    expect(body.projectCount).toBe(3);
  });

  it("should set endDate to end of day", async () => {
    const req = buildRequest("/api/stats/dashboard?endDate=2026-07-31");
    await GET(req as any);

    const calls = (prisma.caseResult.count as jest.Mock).mock.calls;
    const dateFilteredCalls = calls.filter((call: any) => {
      return call[0]?.where?.createdAt !== undefined;
    });
    expect(dateFilteredCalls.length).toBeGreaterThan(0);
    const firstDateCall = dateFilteredCalls[0];
    const endDate = firstDateCall[0].where.createdAt.lte;
    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
  });
});