import { GET } from "@/app/api/stats/matrix/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    batchScope: { findMany: jest.fn() },
    caseResult: { findMany: jest.fn() },
  },
}));

describe("GET /api/stats/matrix", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 400 when batchIds missing", async () => {
    const req = { url: "http://localhost/api/stats/matrix", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it("should return 400 when less than 2 batchIds", async () => {
    const req = { url: "http://localhost/api/stats/matrix?batchIds=b1", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it("should return matrix rows", async () => {
    (prisma.batchScope.findMany as jest.Mock).mockResolvedValue([
      { id: "b1", name: "B1" },
      { id: "b2", name: "B2" },
    ]);

    (prisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      { caseNo: "TC001", name: "T1", batchScopeId: "b1", resultSummary: "PASS" },
      { caseNo: "TC001", name: "T1", batchScopeId: "b2", resultSummary: "FAIL" },
      { caseNo: "TC002", name: "T2", batchScopeId: "b1", resultSummary: "FAIL" },
      { caseNo: "TC002", name: "T2", batchScopeId: "b2", resultSummary: "FAIL" },
    ]);

    const req = { url: "http://localhost/api/stats/matrix?projectId=p1&stageId=s1&batchIds=b1,b2", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    const body = await res.json();

    expect(body.batches).toHaveLength(2);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].results.b1).toBe("PASS");
    expect(body.rows[0].results.b2).toBe("FAIL");
  });
});