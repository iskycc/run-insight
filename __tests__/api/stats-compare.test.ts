import { GET } from "@/app/api/stats/compare/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    projectMember: { findUnique: jest.fn() },
    batchScope: { findUnique: jest.fn() },
    caseResult: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
}));

describe("GET /api/stats/compare", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({
      userId: "u1",
      username: "viewer",
    });
  });

  it("should return 401 before reading data when unauthenticated", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "未登录" },
        { status: 401 }
      )
    );

    const req = { url: "http://localhost/api/stats/compare?batchA=b1&batchB=b2", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(401);
    expect(prisma.batchScope.findUnique).not.toHaveBeenCalled();
  });

  it("should return 400 when batchA or batchB is missing", async () => {
    const req = { url: "http://localhost/api/stats/compare", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it("should return 400 when comparing a batch with itself", async () => {
    const req = { url: "http://localhost/api/stats/compare?batchA=b1&batchB=b1", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(400);
    expect(prisma.batchScope.findUnique).not.toHaveBeenCalled();
  });

  it("should return 404 when batch not found", async () => {
    (prisma.batchScope.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const req = { url: "http://localhost/api/stats/compare?batchA=xxx&batchB=yyy", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(404);
  });

  it("should compute diff correctly", async () => {
    (prisma.batchScope.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: "b1", name: "Batch-1", projectId: "p1", testStageId: "s1" })
      .mockResolvedValueOnce({ id: "b2", name: "Batch-2", projectId: "p1", testStageId: "s1" });

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

  it("should classify every non-identical BLOCK/SKIP transition as a change", async () => {
    (prisma.batchScope.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: "b1", name: "Batch-1", projectId: "p1", testStageId: "s1" })
      .mockResolvedValueOnce({ id: "b2", name: "Batch-2", projectId: "p1", testStageId: "s1" });

    (prisma.caseResult.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { caseNo: "TC001", name: "Block to skip", resultSummary: "BLOCK" },
        { caseNo: "TC002", name: "Skip to block", resultSummary: "SKIP" },
        { caseNo: "TC003", name: "Block unchanged", resultSummary: "BLOCK" },
        { caseNo: "TC004", name: "Block to fail", resultSummary: "BLOCK" },
      ])
      .mockResolvedValueOnce([
        { caseNo: "TC001", name: "Block to skip", resultSummary: "SKIP" },
        { caseNo: "TC002", name: "Skip to block", resultSummary: "BLOCK" },
        { caseNo: "TC003", name: "Block unchanged", resultSummary: "BLOCK" },
        { caseNo: "TC004", name: "Block to fail", resultSummary: "FAIL" },
      ]);

    const req = { url: "http://localhost/api/stats/compare?batchA=b1&batchB=b2", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    const body = await res.json();

    expect(body.diff.unchanged).toBe(1);
    expect(body.diff.otherChanges).toEqual([
      expect.objectContaining({ caseNo: "TC001", resultA: "BLOCK", resultB: "SKIP" }),
      expect.objectContaining({ caseNo: "TC002", resultA: "SKIP", resultB: "BLOCK" }),
      expect.objectContaining({ caseNo: "TC004", resultA: "BLOCK", resultB: "FAIL" }),
    ]);
    expect(body.diff.passToFail).toHaveLength(0);
    expect(body.diff.failToPass).toHaveLength(0);
  });
});
