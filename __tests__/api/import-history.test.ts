import { GET } from "@/app/api/import-history/route";
import { GET as GET_BY_ID } from "@/app/api/import-history/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    importRecord: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
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

describe("GET /api/import-history/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
  });

  it("returns import record details", async () => {
    const record = {
      id: "r1",
      projectId: "p1",
      importType: "pre-analysis",
      fileName: "test.csv",
      totalRows: 10,
      importedCount: 8,
      errorCount: 2,
      errors: [{ row: 3, field: "caseNo", message: "用例编号不能为空" }],
      userId: "u1",
      createdAt: new Date("2026-07-01"),
    };
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue(record);

    const req = createRequest("http://localhost/api/import-history/r1");
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("r1");
    expect(body.errors).toHaveLength(1);
  });

  it("returns 404 when record not found", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue(null);

    const req = createRequest("http://localhost/api/import-history/missing");
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = createRequest("http://localhost/api/import-history/r1");
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 500 on database error", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("http://localhost/api/import-history/r1");
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(500);
  });
});