import { POST } from "@/app/api/import/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: {
      createMany: jest.fn(),
    },
    batchScope: {
      findUnique: jest.fn(),
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

const validPreRow = {
  caseNo: "TC-001",
  name: "测试用例1",
  resultSummary: "FAIL",
};

const basePayload = {
  projectId: "p1",
  testStageId: "s1",
  batchScopeId: "b1",
  importType: "pre-analysis" as const,
};

describe("POST /api/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock: batchScope exists and matches context
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "批跑1",
    });
  });

  it("should return 401 without auth", async () => {
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 if projectId is missing", async () => {
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, projectId: "", rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("必填");
  });

  it("should return 400 if rows is empty", async () => {
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("不能为空");
  });

  it("should return 400 if rows exceed the import limit", async () => {
    const rows = Array.from({ length: 100_001 }, (_, index) => ({
      ...validPreRow,
      caseNo: `TC-${index}`,
    }));
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("超过上限 100000");
    expect(mockPrisma.caseResult.createMany).not.toHaveBeenCalled();
  });

  it("should return 400 for validation errors in rows", async () => {
    const badRow = { caseNo: "", name: "", resultSummary: "" };
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [badRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("should return 400 for in-batch duplicate caseNo", async () => {
    const rows = [validPreRow, { ...validPreRow, caseNo: "TC-001" }];
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    const dupErrors = body.errors.filter(
      (e: { field: string; message: string }) => e.field === "caseNo" && e.message.includes("重复")
    );
    expect(dupErrors.length).toBeGreaterThan(0);
  });

  it("should return 201 on successful import", async () => {
    (mockPrisma.caseResult.createMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.errors).toEqual([]);
  });

  it("should return 409 on P2002 unique constraint error", async () => {
    const error = new Error("Unique constraint failed") as Error & { code: string };
    error.code = "P2002";
    (mockPrisma.caseResult.createMany as jest.Mock).mockRejectedValue(error);

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toBe("CONFLICT");
  });

  it("should return 500 on other database errors", async () => {
    (mockPrisma.caseResult.createMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("should return 400 for missing context fields (testStageId)", async () => {
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        testStageId: "",
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("should transform rows with all optional fields (truthy branches)", async () => {
    (mockPrisma.caseResult.createMany as jest.Mock).mockResolvedValue({ count: 1 });

    const rowWithAllFields = {
      caseNo: "TC-002",
      name: "测试用例2",
      resultSummary: "FAIL",
      logUrl: "https://example.com/log",
      assignee: "张三",
      progressCategory: "LOCATED",
      rootCause: "代码缺陷",
      mrOrTicket: "MR-123",
    };

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, importType: "post-analysis", rows: [rowWithAllFields] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(201);

    const callArgs = (mockPrisma.caseResult.createMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.data[0].logUrl).toBe("https://example.com/log");
    expect(callArgs.data[0].assignee).toBe("张三");
    expect(callArgs.data[0].progressCategory).toBe("LOCATED");
    expect(callArgs.data[0].rootCause).toBe("代码缺陷");
    expect(callArgs.data[0].mrOrTicket).toBe("MR-123");
  });

  it("should transform rows without optional fields (falsy branches)", async () => {
    (mockPrisma.caseResult.createMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(201);

    const callArgs = (mockPrisma.caseResult.createMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.data[0].logUrl).toBeNull();
    expect(callArgs.data[0].assignee).toBeNull();
    expect(callArgs.data[0].progressCategory).toBeNull();
    expect(callArgs.data[0].rootCause).toBeNull();
    expect(callArgs.data[0].mrOrTicket).toBeNull();
  });

  it("should handle row with null/undefined caseNo (nullish coalescing branch)", async () => {
    // Covers line 48: row.caseNo ?? "" where caseNo is null → uses "" fallback → triggers validation error
    const rowWithNullCaseNo = { caseNo: null, name: "测试用例", resultSummary: "FAIL" };
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [rowWithNullCaseNo] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.errors.some((e: { field: string; message: string }) => e.field === "caseNo")).toBe(true);
  });

  it("should return 400 if batchScopeId does not exist", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue(null);

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("批跑范围不存在");
  });

  it("should return 400 if testStageId does not match batchScope", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s-other",
      name: "批跑1",
    });

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("阶段不匹配");
  });

  it("should return 400 if projectId does not match batchScope", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p-other",
      testStageId: "s1",
      name: "批跑1",
    });

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.message).toContain("项目不匹配");
  });

  it("should return 400 for invalid progressCategory in import rows", async () => {
    const rowWithInvalidPC = {
      caseNo: "TC-003",
      name: "测试用例3",
      resultSummary: "FAIL",
      progressCategory: "INVALID",
    };

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [rowWithInvalidPC] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    const pcErrors = body.errors.filter(
      (e: { field: string; message: string }) => e.field === "progressCategory"
    );
    expect(pcErrors.length).toBeGreaterThan(0);
    expect(pcErrors[0].message).toContain("进展分类不合法");
  });
});
