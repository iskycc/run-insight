import { GET } from "@/app/api/assets/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), options as RequestInit);
}

function authCookie(): string {
  const token = generateToken({ userId: "user_1", username: "admin" });
  return `run_insight_token=${token}`;
}

const sampleAsset = {
  id: "clxxxxxxxxxxxxxxxxxxxxxx1",
  caseNo: "TC-001",
  name: "测试用例1",
  resultSummary: "FAIL",
  logUrl: null,
  projectId: "p1",
  testStageId: "s1",
  batchScopeId: "b1",
  assignee: "张三",
  progressCategory: "LOCATED",
  rootCause: "代码缺陷",
  mrOrTicket: null,
  assetSaved: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  project: { id: "p1", name: "项目1" },
  stage: { id: "s1", name: "阶段1" },
  batchScope: { id: "b1", name: "批跑1" },
};

describe("GET /api/assets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth", async () => {
    const req = createRequest("/api/assets");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should return assets with pagination", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([sampleAsset]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(1);

    const req = createRequest("/api/assets");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.assets).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  it("should filter by projectId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets?projectId=p1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.projectId).toBe("p1");
  });

  it("should filter by progressCategory", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets?progressCategory=LOCATED");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.progressCategory).toBe("LOCATED");
  });

  it("should filter by assignee", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets?assignee=张三");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.assignee).toBe("张三");
  });

  it("should always filter by assetSaved=true", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.assetSaved).toBe(true);
  });

  it("should filter by testStageId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets?testStageId=s1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.testStageId).toBe("s1");
  });

  it("should filter by rootCause with contains", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets?rootCause=代码");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.rootCause).toEqual({ contains: "代码" });
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/assets");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("should filter by testStageId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets?testStageId=s1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.testStageId).toBe("s1");
  });

  it("should filter by rootCause with contains", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets?rootCause=代码");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.rootCause).toEqual({ contains: "代码" });
  });

  it("should filter by batchScopeId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/assets?batchScopeId=b1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.batchScopeId).toBe("b1");
  });
});
