import { GET } from "@/app/api/stats/assignee/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    projectMember: { findUnique: jest.fn() },
    testStage: { findUnique: jest.fn().mockResolvedValue({ projectId: "p1" }) },
    batchScope: {
      findUnique: jest.fn().mockResolvedValue({
        projectId: "p1",
        testStageId: "s1",
      }),
    },
    caseResult: { groupBy: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

function authCookie(): string {
  const token = generateToken({ userId: "user_1", username: "admin" });
  return `run_insight_token=${token}`;
}

describe("GET /api/stats/assignee", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const req = createRequest("/api/stats/assignee");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns empty stats when there are no assignees", async () => {
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/stats/assignee");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats).toEqual([]);
  });

  it("aggregates totals, failures, fixes and saved assets per assignee", async () => {
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { assignee: "alice", _count: { _all: 10 } },
        { assignee: "bob", _count: { _all: 5 } },
      ])
      .mockResolvedValueOnce([
        { assignee: "alice", _count: { _all: 4 } },
      ])
      .mockResolvedValueOnce([
        { assignee: "alice", _count: { _all: 3 } },
        { assignee: "bob", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { assignee: "alice", _count: { _all: 2 } },
      ]);

    const req = createRequest("/api/stats/assignee");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    const alice = body.stats.find((s: { assignee: string }) => s.assignee === "alice");
    const bob = body.stats.find((s: { assignee: string }) => s.assignee === "bob");
    expect(alice).toMatchObject({
      assignee: "alice",
      totalCases: 10,
      failCount: 4,
      fixCount: 3,
      savedAssetCount: 2,
      fixRate: 0.75,
    });
    expect(bob).toMatchObject({
      assignee: "bob",
      totalCases: 5,
      failCount: 0,
      fixCount: 1,
      savedAssetCount: 0,
      fixRate: 0,
    });
  });

  it("sorts results by failCount desc", async () => {
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { assignee: "alice", _count: { _all: 10 } },
        { assignee: "bob", _count: { _all: 20 } },
      ])
      .mockResolvedValueOnce([
        { assignee: "bob", _count: { _all: 8 } },
        { assignee: "alice", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const req = createRequest("/api/stats/assignee");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    const body = await res.json();

    expect(body.stats[0].assignee).toBe("bob");
    expect(body.stats[1].assignee).toBe("alice");
  });

  it("ignores null assignees", async () => {
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { assignee: "alice", _count: { _all: 5 } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const req = createRequest("/api/stats/assignee");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    const body = await res.json();

    expect(body.stats.every((s: { assignee: string }) => typeof s.assignee === "string")).toBe(true);
  });

  it("passes filter params through to all groupBy queries", async () => {
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/stats/assignee?projectId=p1&testStageId=s1&batchScopeId=b1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    expect(mockPrisma.caseResult.groupBy).toHaveBeenCalledTimes(4);
    for (const call of (mockPrisma.caseResult.groupBy as jest.Mock).mock.calls) {
      expect(call[0].where).toMatchObject({
        projectId: "p1",
        testStageId: "s1",
        batchScopeId: "b1",
        assignee: { not: null },
      });
    }
  });
});
