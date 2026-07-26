import { GET } from "@/app/api/export/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";
import ExcelJS from "exceljs";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    testStage: { findUnique: jest.fn().mockResolvedValue({ projectId: "p1" }) },
    batchScope: {
      findUnique: jest.fn().mockResolvedValue({ projectId: "p1", testStageId: "s1" }),
    },
    projectMember: { findUnique: jest.fn() },
    caseResult: {
      findMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
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
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
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

  it("streams JSON rows with the existing field format", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      { ...sampleCase, assetSaved: true },
    ]);

    const req = createRequest("/api/export?format=json");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    const body = await res.json();

    expect(body).toEqual({
      cases: [
        expect.objectContaining({
          caseNo: "TC001",
          name: "Test 1",
          assetSaved: "是",
          createdAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
    });
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

  it("should apply all workbench filters", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);

    const req = createRequest(
      "/api/export?progressCategory=FIXED&assetSaved=true&resultSummary=FAIL" +
        "&assignee=alice&rootCause=timeout&search=TC&dateFrom=2026-07-01&dateTo=2026-07-31"
    );
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where).toEqual({
      progressCategory: "FIXED",
      assetSaved: true,
      resultSummary: "FAIL",
      assignee: { contains: "alice" },
      rootCause: { contains: "timeout" },
      OR: [
        { caseNo: { contains: "TC" } },
        { name: { contains: "TC" } },
      ],
      createdAt: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-31T23:59:59.999Z"),
      },
    });
  });

  it("should treat assetSaved=false as an explicit filter", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/export?assetSaved=false");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.assetSaved).toBe(false);
  });

  it.each([
    ["progressCategory=UNKNOWN", "进展分类"],
    ["resultSummary=UNKNOWN", "结果概要"],
    ["assetSaved=yes", "资产状态"],
    ["dateFrom=2026-02-30", "开始日期"],
    ["dateTo=25-07-2026", "结束日期"],
    ["dateFrom=2026-08-01&dateTo=2026-07-01", "开始日期不能晚于结束日期"],
    ["sortField=unknown", "排序字段"],
    ["sortOrder=sideways", "排序方向"],
  ])("rejects invalid export filter %s", async (query, message) => {
    const req = createRequest(`/api/export?${query}`);
    req.headers.set("cookie", authCookie());

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain(message);
    expect(mockPrisma.caseResult.findMany).not.toHaveBeenCalled();
  });

  it("preserves requested sorting", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    const req = createRequest("/api/export?sortField=caseNo&sortOrder=asc");
    req.headers.set("cookie", authCookie());

    await GET(req);

    expect(mockPrisma.caseResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ caseNo: "asc" }, { id: "asc" }],
        take: 500,
      })
    );
  });

  it("escapes all formula-like prefixes in CSV exports", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      {
        ...sampleCase,
        caseNo: "=cmd",
        name: "+cmd",
        logUrl: "-cmd",
        assignee: "@cmd",
      },
    ]);
    const req = createRequest("/api/export?format=csv");
    req.headers.set("cookie", authCookie());

    const res = await GET(req);
    const csv = await res.text();

    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'-cmd");
    expect(csv).toContain("'@cmd");
  });

  it("reads CSV data in stable cursor batches and audits the streamed row count", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      ...sampleCase,
      id: `case-${index}`,
      caseNo: `TC-${index}`,
    }));
    const finalCase = {
      ...sampleCase,
      id: "case-final",
      caseNo: "TC-FINAL",
    };
    (mockPrisma.caseResult.findMany as jest.Mock)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([finalCase]);

    const req = createRequest("/api/export?format=csv&sortField=caseNo&sortOrder=asc");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    const csv = await res.text();

    expect(csv).toContain("TC-0");
    expect(csv).toContain("TC-FINAL");
    expect(mockPrisma.caseResult.findMany).toHaveBeenCalledTimes(2);
    expect((mockPrisma.caseResult.findMany as jest.Mock).mock.calls[1][0]).toEqual(
      expect.objectContaining({
        cursor: { id: "case-499" },
        skip: 1,
        take: 500,
        orderBy: [{ caseNo: "asc" }, { id: "asc" }],
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "EXPORT",
        changes: expect.objectContaining({ rowCount: 501 }),
      }),
    });
  });

  it("stops cursor reads and records cancellation when the client cancels", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      ...sampleCase,
      id: `cancel-${index}`,
    }));
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue(firstPage);

    const req = createRequest("/api/export?format=csv");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    const reader = res.body!.getReader();
    const firstChunk = await reader.read();
    expect(new TextDecoder().decode(firstChunk.value)).toContain("caseNo");

    await reader.cancel();

    expect(mockPrisma.caseResult.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({
          rowCount: 0,
          cancelled: true,
        }),
      }),
    });
  });

  it("errors the stream and stops pagination when a later cursor query fails", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      ...sampleCase,
      id: `error-${index}`,
    }));
    (mockPrisma.caseResult.findMany as jest.Mock)
      .mockResolvedValueOnce(firstPage)
      .mockRejectedValueOnce(new Error("cursor query failed"));

    const req = createRequest("/api/export?format=json");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);

    await expect(res.text()).rejects.toThrow("cursor query failed");
    expect(mockPrisma.caseResult.findMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/export");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("should return an xlsx file with correct headers and content", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([sampleCase]);

    const req = createRequest("/api/export?format=xlsx");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers.get("content-disposition")).toMatch(/filename="run-insight-\d{4}-\d{2}-\d{2}\.xlsx"/);
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
    // xlsx files start with the ZIP magic number "PK\x03\x04"
    const head = new Uint8Array(buffer, 0, 4);
    expect(head[0]).toBe(0x50);
    expect(head[1]).toBe(0x4b);
    expect(head[2]).toBe(0x03);
    expect(head[3]).toBe(0x04);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("用例结果");
    expect(sheet?.getRow(1).values).toEqual(
      expect.arrayContaining(["优先级", "截止日期", "根因分类", "备注"])
    );
  });

  it("rejects Excel exports above the safe row limit with a CSV hint", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue(
      Array(10_001).fill(sampleCase),
    );

    const req = createRequest("/api/export?format=xlsx");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: "EXPORT_TOO_LARGE",
      message: "Excel 导出最多支持 10000 行，请缩小筛选范围或改用 CSV 导出",
    });
    expect(mockPrisma.caseResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10_001 }),
    );
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("should accept format=excel as an alias for xlsx", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([sampleCase]);

    const req = createRequest("/api/export?format=excel");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("should return 400 for an unsupported export format", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);

    const req = createRequest("/api/export?format=xml");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("不支持的导出格式");
  });

  it("should default to CSV when no format is specified", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([sampleCase]);

    const req = createRequest("/api/export");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.headers.get("content-type")).toContain("text/csv");
  });
});
