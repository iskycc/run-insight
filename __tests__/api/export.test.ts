import { GET } from "@/app/api/export/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: {
      findMany: jest.fn(),
    },
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

const sampleCase = {
  id: "clxxxxxxxxxxxxxxxxxxxxxx1",
  caseNo: "TC001",
  name: "Test 1",
  resultSummary: "PASS",
  logUrl: null,
  projectId: "p1",
  testStageId: "s1",
  batchScopeId: "b1",
  assignee: null,
  progressCategory: null,
  rootCause: null,
  mrOrTicket: null,
  assetSaved: false,
  createdAt: new Date("2026-07-01"),
  updatedAt: new Date("2026-07-01"),
};

describe("GET /api/export", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth", async () => {
    const req = createRequest("/api/export");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should return CSV with correct headers", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([sampleCase]);

    const req = createRequest("/api/export?format=csv");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);

    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("caseNo,name,resultSummary");
    expect(text).toContain("TC001,Test 1,PASS");
  });

  it("should return JSON when format=json", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/export?format=json");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);

    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.cases).toEqual([]);
  });

  it("should filter by projectId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/export?projectId=p1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.projectId).toBe("p1");
  });

  it("should filter by testStageId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/export?testStageId=s1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.testStageId).toBe("s1");
  });

  it("should filter by batchScopeId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/export?batchScopeId=b1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.batchScopeId).toBe("b1");
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/export");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});