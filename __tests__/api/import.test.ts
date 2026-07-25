import { POST } from "@/app/api/import/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => {
  const tx = {
    caseResult: {
      upsert: jest.fn(),
    },
    importRecord: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  return {
    prisma: {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
      caseResult: {
        createMany: jest.fn(),
        upsert: jest.fn(),
      },
      batchScope: {
        findUnique: jest.fn(),
      },
      importRecord: {
        create: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const txMock = (mockPrisma as unknown as {
  $transaction: jest.Mock;
}).$transaction;

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

beforeEach(() => {
  jest.clearAllMocks();
  // Default: batchScope exists and matches context
  (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
    id: "b1",
    projectId: "p1",
    testStageId: "s1",
    name: "批跑1",
  });
  // Default: $transaction invokes the callback with an internal tx object
  txMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback({
      caseResult: { upsert: txUpsert },
      importRecord: { create: txImportCreate },
      auditLog: { create: txAuditCreate },
    });
  });
});

const txUpsert = jest.fn();
const txImportCreate = jest.fn();
const txAuditCreate = jest.fn();

describe("POST /api/import", () => {
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
    expect(txMock).not.toHaveBeenCalled();
    expect(txUpsert).not.toHaveBeenCalled();
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

  it("should return 201 and run a single transaction on successful import", async () => {
    const now = new Date();
    txUpsert.mockResolvedValue({ createdAt: now, updatedAt: now, assetSaved: false });

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

    // Single $transaction call wrapping everything
    expect(txMock).toHaveBeenCalledTimes(1);
    expect(txUpsert).toHaveBeenCalledTimes(1);
    // audit + import record both written via the transaction client
    expect(txAuditCreate).toHaveBeenCalledTimes(1);
    expect(txImportCreate).toHaveBeenCalledTimes(1);
  });

  it("should detect a new row (created) when createdAt equals updatedAt", async () => {
    const now = new Date();
    txUpsert.mockResolvedValue({ createdAt: now, updatedAt: now, assetSaved: false });

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    await POST(req);

    const auditCall = txAuditCreate.mock.calls[0][0];
    expect(auditCall.data.changes.created).toBe(1);
    expect(auditCall.data.changes.updated).toBe(0);
    expect(auditCall.data.changes.imported).toBe(1);
  });

  it("should detect an updated row when updatedAt is after createdAt", async () => {
    const created = new Date("2025-01-01T00:00:00.000Z");
    const updated = new Date("2025-02-01T00:00:00.000Z");
    txUpsert.mockResolvedValue({ createdAt: created, updatedAt: updated, assetSaved: true });

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    await POST(req);

    const auditCall = txAuditCreate.mock.calls[0][0];
    expect(auditCall.data.changes.created).toBe(0);
    expect(auditCall.data.changes.updated).toBe(1);
  });

  it("should pass the compound unique key to upsert and explicit create/update payloads", async () => {
    const now = new Date();
    txUpsert.mockResolvedValue({ createdAt: now, updatedAt: now, assetSaved: false });

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
    await POST(req);

    const callArgs = txUpsert.mock.calls[0][0];
    expect(callArgs.where).toEqual({
      projectId_testStageId_batchScopeId_caseNo: {
        projectId: "p1",
        testStageId: "s1",
        batchScopeId: "b1",
        caseNo: "TC-002",
      },
    });
    expect(callArgs.create.assetSaved).toBe(false);
    expect(callArgs.create.assignee).toBe("张三");
    expect(callArgs.update.assignee).toBe("张三");
    expect(callArgs.update.resultSummary).toBe("FAIL");
    // Do NOT overwrite assetSaved on update — preserve analysis decision
    expect(callArgs.update.assetSaved).toBeUndefined();
  });

  it("should return 409 on P2002 unique constraint error", async () => {
    const error = new Error("Unique constraint failed") as Error & { code: string };
    error.code = "P2002";
    txUpsert.mockRejectedValue(error);

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
    txUpsert.mockRejectedValue(new Error("DB error"));

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

  it("should handle row with null/undefined caseNo (nullish coalescing branch)", async () => {
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

  it("should return 500 if the transaction itself rejects (rollback path)", async () => {
    txMock.mockImplementationOnce(async () => {
      throw new Error("transaction failed");
    });

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
