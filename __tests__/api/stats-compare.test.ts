import { GET } from "@/app/api/stats/compare/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    batchScope: { findUnique: jest.fn() },
    caseResult: { findMany: jest.fn() },
  },
}));

describe("GET /api/stats/compare", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 400 when batchA or batchB is missing", async () => {
    const req = { url: "http://localhost/api/stats/compare", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it("should return 404 when batch not found", async () => {
    (prisma.batchScope.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const req = { url: "http://localhost/api/stats/compare?batchA=xxx&batchB=yyy", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(404);
  });

  it("should compute diff correctly", async () => {
    (prisma.batchScope.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: "b1", name: "Batch-1" })
      .mockResolvedValueOnce({ id: "b2", name: "Batch-2" });

    (prisma.caseResult.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { caseNo: "TC001", name: "Test 1", resultSummary: "PASS" },
        { caseNo: "TC002", name: "Test 2", resultSummary: "FAIL" },
        { caseNo: "TC003", name: "Test 3", resultSummary: "PASS" },
      ])
      .mockResolvedValueOnce([
        { caseNo: "TC001", name: "Test 1", resultSummary: "PASS" },
        { caseNo: "TC002", name: "Test 2", resultSummary: "PASS" },
        { caseNo: "TC004", name: "Test 4", resultSummary: "FAIL" },
      ]);

    const req = { url: "http://localhost/api/stats/compare?batchA=b1&batchB=b2", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    const body = await res.json();

    expect(body.diff.unchanged).toBe(1);
    expect(body.diff.failToPass).toHaveLength(1);
    expect(body.diff.failToPass[0].caseNo).toBe("TC002");
    expect(body.diff.removedFromB).toHaveLength(1);
    expect(body.diff.removedFromB[0].caseNo).toBe("TC003");
    expect(body.diff.newInB).toHaveLength(1);
    expect(body.diff.newInB[0].caseNo).toBe("TC004");
  });
});