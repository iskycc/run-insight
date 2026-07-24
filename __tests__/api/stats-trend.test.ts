import { GET } from "@/app/api/stats/trend/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    batchScope: { findMany: jest.fn() },
    caseResult: { groupBy: jest.fn() },
  },
}));

describe("GET /api/stats/trend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.batchScope.findMany as jest.Mock).mockResolvedValue([
      { id: "b1", name: "Batch-1", projectId: "p1" },
      { id: "b2", name: "Batch-2", projectId: "p1" },
    ]);
    (prisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);
  });

  it("should filter batches by projectId when provided", async () => {
    const req = { url: "http://localhost/api/stats/trend?projectId=p1", headers: new Headers() } as unknown as Request;
    await GET(req as any);

    const findManyCall = (prisma.batchScope.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).toEqual({ projectId: "p1" });
  });

  it("should not filter when projectId not provided", async () => {
    const req = { url: "http://localhost/api/stats/trend", headers: new Headers() } as unknown as Request;
    await GET(req as any);

    const findManyCall = (prisma.batchScope.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).toEqual({});
  });
});