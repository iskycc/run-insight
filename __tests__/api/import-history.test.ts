import { GET } from "@/app/api/import-history/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    importRecord: { findMany: jest.fn(), count: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/import-history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (mockPrisma.importRecord.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.importRecord.count as jest.Mock).mockResolvedValue(0);
  });

  it("should return paginated records", async () => {
    const mockRecords = [
      {
        id: "r1",
        projectId: "p1",
        importType: "pre-analysis",
        fileName: "test.csv",
        totalRows: 10,
        importedCount: 8,
        errorCount: 2,
        errors: null,
        userId: "u1",
        createdAt: new Date("2026-07-01"),
      },
    ];
    (mockPrisma.importRecord.findMany as jest.Mock).mockResolvedValue(mockRecords);
    (mockPrisma.importRecord.count as jest.Mock).mockResolvedValue(1);

    const req = createRequest("http://localhost/api/import-history");
    const res = await GET(req);
    const body = await res.json();

    expect(body.records).toHaveLength(1);
    expect(body.records[0].fileName).toBe("test.csv");
    expect(body.records[0].createdAt).toBe("2026-07-01T00:00:00.000Z");
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
  });

  it("should return 401 when not authenticated", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 }));
    const req = createRequest("http://localhost/api/import-history");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should filter by projectId", async () => {
    const req = createRequest("http://localhost/api/import-history?projectId=p1");
    const res = await GET(req);
    await res.json();

    expect(mockPrisma.importRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "p1" } })
    );
    expect(mockPrisma.importRecord.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "p1" } })
    );
  });

  it("should apply pagination", async () => {
    const req = createRequest("http://localhost/api/import-history?page=2&pageSize=10");
    const res = await GET(req);
    const body = await res.json();

    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
    expect(mockPrisma.importRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });
});