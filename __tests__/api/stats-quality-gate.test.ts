import { GET } from "@/app/api/stats/quality-gate/route";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    batchScope: { findFirst: jest.fn() },
    caseResult: { groupBy: jest.fn(), count: jest.fn() },
  },
}));

const currentBatch = {
  id: "batch-current",
  name: "当前批跑",
  projectId: "project-1",
  testStageId: "stage-1",
  archived: false,
  executedAt: new Date("2026-07-27T08:00:00.000Z"),
  createdAt: new Date("2026-07-27T08:01:00.000Z"),
  stage: { archived: false },
};
const baselineBatch = {
  ...currentBatch,
  id: "batch-baseline",
  name: "上一批跑",
  executedAt: new Date("2026-07-26T08:00:00.000Z"),
  createdAt: new Date("2026-07-26T08:01:00.000Z"),
};

function request(query = "") {
  return new NextRequest(`http://localhost/api/stats/quality-gate${query}`);
}

describe("GET /api/stats/quality-gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "user-1",
      username: "alice",
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project-1",
      archived: false,
    });
    (prisma.caseResult.count as jest.Mock).mockResolvedValue(0);
  });

  it("requires authentication and a project", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValueOnce(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "未登录" },
        { status: 401 },
      ),
    );
    expect((await GET(request("?projectId=project-1"))).status).toBe(401);

    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "user-1",
      username: "alice",
    });
    expect((await GET(request())).status).toBe(400);
  });

  it("denies users without project visibility", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await GET(request("?projectId=project-1"));

    expect(response.status).toBe(403);
    expect(prisma.batchScope.findFirst).not.toHaveBeenCalled();
  });

  it("uses the latest active batch and returns each failed gate reason", async () => {
    (prisma.batchScope.findFirst as jest.Mock)
      .mockResolvedValueOnce(currentBatch)
      .mockResolvedValueOnce(null);
    (prisma.caseResult.groupBy as jest.Mock).mockResolvedValue([
      { resultSummary: "PASS", _count: { _all: 8 } },
      { resultSummary: "FAIL", _count: { _all: 1 } },
      { resultSummary: "BLOCK", _count: { _all: 1 } },
    ]);
    (prisma.caseResult.count as jest.Mock).mockResolvedValue(2);

    const response = await GET(
      request(
        "?projectId=project-1&minPassRate=90&maxFailCount=0&maxBlockCount=0&maxPendingCount=1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.passed).toBe(false);
    expect(body.metrics).toEqual({
      totalCount: 10,
      passCount: 8,
      failCount: 1,
      blockCount: 1,
      pendingCount: 2,
      passRate: 80,
    });
    expect(body.reasons).toHaveLength(4);
    expect(body.comparison).toBeNull();
    expect(prisma.batchScope.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          projectId: "project-1",
          archived: false,
          stage: { archived: false },
        },
        orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  it("returns pass-rate delta and regression against the previous stage batch", async () => {
    (prisma.batchScope.findFirst as jest.Mock)
      .mockResolvedValueOnce(currentBatch)
      .mockResolvedValueOnce(baselineBatch);
    (prisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { resultSummary: "PASS", _count: { _all: 8 } },
        { resultSummary: "FAIL", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { resultSummary: "PASS", _count: { _all: 9 } },
        { resultSummary: "FAIL", _count: { _all: 1 } },
      ]);

    const response = await GET(
      request(
        "?projectId=project-1&minPassRate=0&maxFailCount=10&maxBlockCount=10&maxPendingCount=10",
      ),
    );
    const body = await response.json();

    expect(body.passed).toBe(true);
    expect(body.comparison).toEqual({
      baselineBatchId: "batch-baseline",
      baselineBatchName: "上一批跑",
      baselinePassRate: 90,
      delta: -10,
      regression: true,
    });
    expect(prisma.batchScope.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "project-1",
          testStageId: "stage-1",
          archived: false,
        }),
      }),
    );
  });

  it("handles an empty batch without inventing a trend or dividing by zero", async () => {
    (prisma.batchScope.findFirst as jest.Mock)
      .mockResolvedValueOnce(currentBatch)
      .mockResolvedValueOnce(null);
    (prisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const response = await GET(request("?projectId=project-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metrics.passRate).toBe(0);
    expect(body.comparison).toBeNull();
    expect(body.passed).toBe(false);
    expect(body.reasons).toEqual([
      "通过率 0%，要求不低于 95%",
    ]);
  });

  it("does not expose a batch belonging to another project", async () => {
    (prisma.batchScope.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      request("?projectId=project-1&batchId=foreign-batch"),
    );

    expect(response.status).toBe(404);
    expect(prisma.batchScope.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "foreign-batch", projectId: "project-1" },
      }),
    );
    expect(prisma.caseResult.groupBy).not.toHaveBeenCalled();
  });

  it("rejects archived projects, stages and batches", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "project-1",
      archived: true,
    });
    expect((await GET(request("?projectId=project-1"))).status).toBe(409);

    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project-1",
      archived: false,
    });
    (prisma.batchScope.findFirst as jest.Mock).mockResolvedValue({
      ...currentBatch,
      archived: true,
    });
    expect(
      (
        await GET(
          request("?projectId=project-1&batchId=batch-current"),
        )
      ).status,
    ).toBe(409);
  });

  it.each([
    ["minPassRate=-1", "minPassRate"],
    ["minPassRate=101", "minPassRate"],
    ["maxFailCount=1.5", "maxFailCount"],
    ["maxBlockCount=-1", "maxBlockCount"],
    ["maxPendingCount=abc", "maxPendingCount"],
  ])("rejects invalid threshold %s", async (query, message) => {
    const response = await GET(
      request(`?projectId=project-1&${query}`),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain(message);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });
});
