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
      {
        id: "b2",
        name: "Batch-2",
        projectId: "p1",
        executedAt: new Date("2026-01-02"),
        createdAt: new Date("2026-01-02"),
      },
      {
        id: "b1",
        name: "Batch-1",
        projectId: "p1",
        executedAt: new Date("2026-01-01"),
        createdAt: new Date("2026-01-01"),
      },
    ]);
    (prisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);
  });

  it("should filter batches by projectId when provided", async () => {
    const req = { url: "http://localhost/api/stats/trend?projectId=p1", headers: new Headers() } as unknown as Request;
    await GET(req as never);

    const findManyCall = (prisma.batchScope.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).toEqual({ projectId: "p1" });
    expect(findManyCall.orderBy).toEqual([
      { executedAt: "desc" },
      { createdAt: "desc" },
    ]);
    expect(findManyCall.take).toBe(10);
  });

  it("should not filter when projectId not provided", async () => {
    const req = { url: "http://localhost/api/stats/trend", headers: new Headers() } as unknown as Request;
    await GET(req as never);

    const findManyCall = (prisma.batchScope.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).toEqual({});
  });

  it("returns the selected newest runs in chronological chart order", async () => {
    const req = {
      url: "http://localhost/api/stats/trend?limit=2",
      headers: new Headers(),
    } as unknown as Request;

    const res = await GET(req as never);
    const body = await res.json();

    expect(body.trends.map((item: { batchId: string }) => item.batchId)).toEqual([
      "b1",
      "b2",
    ]);
    expect(body.trends.map((item: { executedAt: string }) => item.executedAt)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    ]);
    expect(prisma.batchScope.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
  });

  it.each(["0", "1.5", "31", "abc"])(
    "rejects an invalid trend limit %s",
    async (limit) => {
      const req = {
        url: `http://localhost/api/stats/trend?limit=${limit}`,
        headers: new Headers(),
      } as unknown as Request;

      const res = await GET(req as never);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "VALIDATION_ERROR",
        message: "趋势数量必须为 1 到 30 的整数",
      });
      expect(prisma.batchScope.findMany).not.toHaveBeenCalled();
    },
  );
});
