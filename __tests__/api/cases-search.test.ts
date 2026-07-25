import { GET } from "@/app/api/cases/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    projectMember: { findUnique: jest.fn() },
    caseResult: {
      findMany: jest.fn(),
      count: jest.fn(),
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

describe("GET /api/cases search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);
  });

  it("should add OR condition when search param provided", async () => {
    const req = createRequest("/api/cases?search=支付");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.OR).toBeDefined();
    expect(findManyCall.where.OR).toHaveLength(2);
    expect(findManyCall.where.OR[0]).toEqual({ caseNo: { contains: "支付" } });
    expect(findManyCall.where.OR[1]).toEqual({ name: { contains: "支付" } });
  });

  it("should not add OR condition without search param", async () => {
    const req = createRequest("/api/cases");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.OR).toBeUndefined();
  });

  it("should combine search with other filters", async () => {
    const req = createRequest("/api/cases?projectId=p1&search=支付");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.projectId).toBe("p1");
    expect(findManyCall.where.OR).toBeDefined();
    expect(findManyCall.where.OR).toHaveLength(2);
  });

  it("should filter by assignee and root-cause keywords", async () => {
    const req = createRequest("/api/cases?assignee=alice&rootCause=timeout");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.assignee).toEqual({ contains: "alice" });
    expect(findManyCall.where.rootCause).toEqual({ contains: "timeout" });
  });
});
