import { GET } from "@/app/api/import-history/route";
import { GET as GET_BY_ID } from "@/app/api/import-history/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    projectMember: { findUnique: jest.fn() },
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
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
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
        project: { name: "项目一" },
        user: { username: "admin" },
        createdAt: new Date("2026-07-01"),
      },
    ];
    (mockPrisma.importRecord.findMany as jest.Mock)
      .mockResolvedValueOnce(mockRecords)
      .mockResolvedValueOnce([{ project: { id: "p1", name: "项目一" } }]);
    (mockPrisma.importRecord.count as jest.Mock).mockResolvedValue(1);

    const req = createRequest("http://localhost/api/import-history");
    const res = await GET(req);
    const body = await res.json();

    expect(body.records).toHaveLength(1);
    expect(body.records[0].fileName).toBe("test.csv");
    expect(body.records[0].projectName).toBe("项目一");
    expect(body.records[0].username).toBe("admin");
    expect(body.records[0].status).toBe("partial");
    expect(body.records[0].createdAt).toBe("2026-07-01T00:00:00.000Z");
    expect(body.projects).toEqual([{ id: "p1", name: "项目一" }]);
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

  it.each([
    ["success", { errorCount: 0 }],
    ["partial", { errorCount: { gt: 0 }, importedCount: { gt: 0 } }],
    ["failed", { errorCount: { gt: 0 }, importedCount: 0 }],
  ])("should filter by %s status", async (status, expectedWhere) => {
    const req = createRequest(`http://localhost/api/import-history?status=${status}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockPrisma.importRecord.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("should reject an invalid status filter", async () => {
    const req = createRequest("http://localhost/api/import-history?status=unknown");
    const res = await GET(req);
    expect(res.status).toBe(400);
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

  it("clamps invalid pagination values to the supported range", async () => {
    const req = createRequest(
      "http://localhost/api/import-history?page=-2&pageSize=500"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(100);
    expect(mockPrisma.importRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 100 })
    );
  });

  it("returns 401 when the authenticated user no longer exists", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await GET(createRequest("http://localhost/api/import-history"));

    expect(res.status).toBe(401);
    expect(mockPrisma.importRecord.findMany).not.toHaveBeenCalled();
  });

  it("limits non-admin history and project options to memberships", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });

    const res = await GET(createRequest("http://localhost/api/import-history"));

    expect(res.status).toBe(200);
    const memberWhere = {
      project: { members: { some: { userId: "u1" } } },
    };
    expect(mockPrisma.importRecord.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: memberWhere })
    );
    expect(mockPrisma.importRecord.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: memberWhere })
    );
  });

  it("rejects a project filter when the user is not a project member", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await GET(
      createRequest("http://localhost/api/import-history?projectId=p-private")
    );

    expect(res.status).toBe(403);
    expect(mockPrisma.importRecord.findMany).not.toHaveBeenCalled();
  });

  it("maps success, failed, and rolled-back record fields", async () => {
    (mockPrisma.importRecord.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "success",
          projectId: "p1",
          importType: "pre-analysis",
          fileName: "success.csv",
          totalRows: 1,
          importedCount: 1,
          errorCount: 0,
          userId: "u1",
          rolledBackAt: new Date("2026-07-02T00:00:00.000Z"),
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
          project: { name: "项目一" },
          user: { username: "admin" },
        },
        {
          id: "failed",
          projectId: "p1",
          importType: "pre-analysis",
          fileName: "failed.csv",
          totalRows: 1,
          importedCount: 0,
          errorCount: 1,
          userId: "u1",
          rolledBackAt: null,
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
          project: { name: "项目一" },
          user: { username: "admin" },
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET(createRequest("http://localhost/api/import-history"));
    const body = await res.json();

    expect(body.records.map((record: { status: string }) => record.status)).toEqual([
      "success",
      "failed",
    ]);
    expect(body.records[0].rolledBackAt).toBe("2026-07-02T00:00:00.000Z");
    expect(body.records[1].rolledBackAt).toBeNull();
  });

  it("returns 500 when history lookup fails", async () => {
    (mockPrisma.importRecord.findMany as jest.Mock).mockRejectedValue(
      new Error("DB error")
    );

    const res = await GET(createRequest("http://localhost/api/import-history"));

    expect(res.status).toBe(500);
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
      project: { name: "项目一" },
      user: { username: "admin" },
      createdAt: new Date("2026-07-01"),
    };
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue(record);

    const req = createRequest("http://localhost/api/import-history/r1");
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("r1");
    expect(body.projectName).toBe("项目一");
    expect(body.username).toBe("admin");
    expect(body.status).toBe("partial");
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
