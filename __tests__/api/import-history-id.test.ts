import { GET } from "@/app/api/import-history/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    importRecord: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(id: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000/api/import-history/${id}`));
}

describe("GET /api/import-history/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
  });

  it("should return the import record detail", async () => {
    const record = {
      id: "r1",
      projectId: "p1",
      importType: "pre-analysis",
      fileName: "test.csv",
      totalRows: 10,
      importedCount: 8,
      errorCount: 2,
      errors: [{ row: 2, field: "caseNo", message: "编号为空" }],
      userId: "u1",
      createdAt: new Date("2026-07-01"),
    };
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue(record);

    const req = createRequest("r1");
    const res = await GET(req, { params: Promise.resolve({ id: "r1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("r1");
    expect(body.fileName).toBe("test.csv");
    expect(body.errors).toHaveLength(1);
    expect(body.createdAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("should return 404 when record is not found", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue(null);

    const req = createRequest("missing");
    const res = await GET(req, { params: Promise.resolve({ id: "missing" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("NOT_FOUND");
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("r1");
    const res = await GET(req, { params: Promise.resolve({ id: "r1" }) });

    expect(res.status).toBe(500);
  });

  it("should return 401 when not authenticated", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = createRequest("r1");
    const res = await GET(req, { params: Promise.resolve({ id: "r1" }) });

    expect(res.status).toBe(401);
  });
});
