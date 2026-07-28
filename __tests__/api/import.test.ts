import { POST } from "@/app/api/import/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => {
  const mockTx = {
    caseResult: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    importRecord: {
      create: jest.fn(),
      update: jest.fn(),
    },
    importChange: {
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
        findMany: jest.fn(),
        createMany: jest.fn(),
        upsert: jest.fn(),
      },
      batchScope: {
        findUnique: jest.fn(),
      },
    importRecord: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(
        async (callback: (transaction: typeof mockTx) => Promise<unknown>) =>
          callback(mockTx)
      ),
    },
  };
});

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const txMock = (mockPrisma as unknown as {
  $transaction: jest.Mock;
}).$transaction;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new URL(url, "http://localhost:3000"),
    options as ConstructorParameters<typeof NextRequest>[1],
  );
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
  (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue(null);
  txFindMany.mockResolvedValue([]);
  txUpsert.mockResolvedValue({ id: "case-1", updatedAt: new Date("2026-07-25T00:00:00.000Z") });
  txImportCreate.mockResolvedValue({ id: "import-1" });
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
      caseResult: { findMany: txFindMany, upsert: txUpsert },
      importRecord: { create: txImportCreate, update: txImportUpdate },
      importChange: { create: txImportChangeCreate },
      auditLog: { create: txAuditCreate },
    });
  });
});

const txUpsert = jest.fn();
const txFindMany = jest.fn();
const txImportCreate = jest.fn();
const txImportUpdate = jest.fn();
const txImportChangeCreate = jest.fn();
const txAuditCreate = jest.fn();

function existingCase(caseNo = "TC-001") {
  return {
    id: `case-${caseNo}`,
    caseNo,
    name: "旧名称",
    resultSummary: "PASS",
    logUrl: null,
    projectId: "p1",
    testStageId: "s1",
    batchScopeId: "b1",
    assignee: null,
    assigneeId: null,
    priority: null,
    dueDate: null,
    progressCategory: null,
    rootCause: null,
    rootCauseCategoryId: null,
    mrOrTicket: null,
    notes: null,
    assetSaved: false,
    updatedBy: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
  };
}

describe("POST /api/import", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";

  it("requires a valid worker secret and current owner permission", async () => {
    const originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "worker-secret";
    try {
      const invalidSecret = createRequest("/api/import", {
        method: "POST",
        body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
        headers: {
          "Content-Type": "application/json",
          "x-import-worker-secret": "wrong",
          "x-import-owner-id": "user_1",
          cookie: authCookie(),
        },
      });
      expect((await POST(invalidSecret)).status).toBe(401);

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
      const missingOwner = createRequest("/api/import", {
        method: "POST",
        body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
        headers: {
          "Content-Type": "application/json",
          "x-import-worker-secret": "worker-secret",
          "x-import-owner-id": "missing",
        },
      });
      expect((await POST(missingOwner)).status).toBe(401);

      (mockPrisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: "user_1", username: "viewer" })
        .mockResolvedValueOnce({ role: "VIEWER" });
      const forbiddenOwner = createRequest("/api/import", {
        method: "POST",
        body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
        headers: {
          "Content-Type": "application/json",
          "x-import-worker-secret": "worker-secret",
          "x-import-owner-id": "user_1",
        },
      });
      expect((await POST(forbiddenOwner)).status).toBe(403);
    } finally {
      if (originalSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = originalSecret;
    }
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

  it("rejects an invalid importType before reading project data", async () => {
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        importType: "unexpected",
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({
      error: "VALIDATION_ERROR",
      message: expect.stringContaining("导入类型"),
    });
    expect(mockPrisma.batchScope.findUnique).not.toHaveBeenCalled();
  });

  it("rejects invalid resultSummary values with standard validation details", async () => {
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        rows: [{ ...validPreRow, resultSummary: "UNKNOWN" }],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toEqual(expect.any(String));
    expect(body.details).toEqual([
      expect.objectContaining({
        field: "resultSummary",
        message: expect.stringContaining("PASS/FAIL/BLOCK/SKIP"),
      }),
    ]);
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
    const rows = Array.from({ length: 100_001 }, () => ({}));
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
    expect(body).toEqual(
      expect.objectContaining({
        error: "VALIDATION_ERROR",
        message: expect.any(String),
        details: expect.any(Array),
      })
    );
    expect(body.details.length).toBeGreaterThan(0);
    expect(mockPrisma.importRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p1",
        fileName: "unknown",
        totalRows: 1,
        importedCount: 0,
        errorCount: body.details.length,
        errors: body.details,
        userId: "user_1",
      }),
    });
  });

  it("should still return row validation errors when history persistence fails", async () => {
    (mockPrisma.importRecord.create as jest.Mock).mockRejectedValueOnce(
      new Error("history unavailable")
    );
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        fileName: "invalid.csv",
        rows: [{ caseNo: "", name: "", resultSummary: "" }],
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.details.length).toBeGreaterThan(0);
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
    const dupErrors = body.details.filter(
      (e: { field: string; message: string }) => e.field === "caseNo" && e.message.includes("重复")
    );
    expect(dupErrors.length).toBeGreaterThan(0);
  });

  it("should preview created, updated, and unchanged rows without writing history", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      {
        caseNo: "TC-001",
        name: "测试用例1",
        resultSummary: "FAIL",
        logUrl: null,
        assignee: null,
        progressCategory: null,
        rootCause: null,
        mrOrTicket: null,
      },
      {
        caseNo: "TC-002",
        name: "旧名称",
        resultSummary: "PASS",
        logUrl: null,
        assignee: null,
        progressCategory: null,
        rootCause: null,
        mrOrTicket: null,
      },
    ]);
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        preview: true,
        rows: [
          validPreRow,
          { ...validPreRow, caseNo: "TC-002", name: "新名称" },
          { ...validPreRow, caseNo: "TC-003", name: "新增用例" },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      preview: true,
      total: 3,
      created: 1,
      updated: 1,
      unchanged: 1,
      samples: {
        created: [{ caseNo: "TC-003", name: "新增用例" }],
        updated: [{ caseNo: "TC-002", name: "新名称" }],
        unchanged: [{ caseNo: "TC-001", name: "测试用例1" }],
      },
      errors: [],
    });
    expect(mockPrisma.caseResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "p1",
          testStageId: "s1",
          batchScopeId: "b1",
        }),
      })
    );
    expect(txMock).not.toHaveBeenCalled();
    expect(mockPrisma.importRecord.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("supports dryRun as an alias and limits preview samples", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    const rows = Array.from({ length: 7 }, (_, index) => ({
      ...validPreRow,
      caseNo: `TC-${index}`,
    }));
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, dryRun: true, rows }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(7);
    expect(body.samples.created).toHaveLength(5);
    expect(txMock).not.toHaveBeenCalled();
  });

  it("chunks existing-row lookups for large previews", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    const rows = Array.from({ length: 5_001 }, (_, index) => ({
      ...validPreRow,
      caseNo: `TC-${index}`,
    }));
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, preview: true, rows }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.created).toBe(5_001);
    expect(mockPrisma.caseResult.findMany).toHaveBeenCalledTimes(2);
    expect(
      (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0].where.caseNo.in
    ).toHaveLength(5_000);
    expect(
      (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[1][0].where.caseNo.in
    ).toHaveLength(1);
  });

  it("does not persist validation history during preview", async () => {
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        preview: true,
        rows: [{ caseNo: "", name: "", resultSummary: "" }],
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockPrisma.importRecord.create).not.toHaveBeenCalled();
    expect(mockPrisma.caseResult.findMany).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
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
    expect(body.created).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.errors).toEqual([]);

    // Single $transaction call wrapping everything
    expect(txMock).toHaveBeenCalledTimes(1);
    expect(txUpsert).toHaveBeenCalledTimes(1);
    // audit + import record both written via the transaction client
    expect(txAuditCreate).toHaveBeenCalledTimes(1);
    expect(txImportCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps a successful import when the best-effort audit write fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    txAuditCreate.mockRejectedValueOnce(new Error("audit unavailable"));

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(txImportUpdate).toHaveBeenCalled();
    expect(JSON.parse(consoleError.mock.calls[0][0])).toEqual(
      expect.objectContaining({
        level: "error",
        event: "audit.write_failed",
        context: expect.objectContaining({
          action: "IMPORT",
          entityType: "import",
        }),
      }),
    );
    consoleError.mockRestore();
  });

  it("should count a row as created when its compound key did not exist", async () => {
    txFindMany.mockResolvedValue([]);
    txUpsert.mockResolvedValue({});

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    await POST(req);

    const auditCall = txAuditCreate.mock.calls[0][0];
    expect(auditCall.data.action).toBe("IMPORT");
    expect(auditCall.data.entityType).toBe("import");
    expect(auditCall.data.changes.created).toBe(1);
    expect(auditCall.data.changes.updated).toBe(0);
    expect(auditCall.data.changes.imported).toBe(1);
  });

  it("should count a row as updated when its compound key already existed", async () => {
    txFindMany.mockResolvedValue([existingCase()]);

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

  it("should return reliable created and updated counts without comparing timestamps", async () => {
    txFindMany.mockResolvedValue([existingCase()]);

    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        rows: [validPreRow, { ...validPreRow, caseNo: "TC-002" }],
        fileName: "result.csv",
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({
      imported: 2,
      created: 1,
      updated: 1,
      unchanged: 0,
      errors: [],
    });
    expect(txImportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fileName: "result.csv",
        importedCount: 0,
      }),
    });
    expect(txImportUpdate).toHaveBeenCalledWith({
      where: { id: "import-1" },
      data: { importedCount: 2 },
    });
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
    const pcErrors = body.details.filter(
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
    expect(body.details.some((e: { field: string; message: string }) => e.field === "caseNo")).toBe(true);
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

  it("returns the persisted result when the same requestId is retried", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue({
      userId: "user_1",
      projectId: "p1",
      totalRows: 4,
      importedCount: 3,
      changes: [
        { changeType: "CREATED" },
        { changeType: "UPDATED" },
        { changeType: "UPDATED" },
      ],
    });
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        requestId,
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      imported: 3,
      created: 1,
      updated: 2,
      unchanged: 1,
      errors: [],
    });
    expect(txMock).not.toHaveBeenCalled();
  });

  it("rejects requestId reuse by a different project or user", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue({
      userId: "another-user",
      projectId: "p1",
      totalRows: 1,
      importedCount: 1,
      changes: [],
    });
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        requestId,
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "IDEMPOTENCY_CONFLICT",
      message: expect.any(String),
    });
  });

  it("rejects requestId reuse by the same user in a different project", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue({
      userId: "user_1",
      projectId: "another-project",
      totalRows: 1,
      importedCount: 1,
      changes: [],
    });
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        requestId,
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("IDEMPOTENCY_CONFLICT");
  });

  it.each(["not-a-uuid", 123])("rejects invalid requestId %p", async (invalidId) => {
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        requestId: invalidId,
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("UUID");
    expect(mockPrisma.importRecord.findUnique).not.toHaveBeenCalled();
  });

  it("returns the winning idempotent import after a P2002 race", async () => {
    const error = Object.assign(new Error("Unique requestId"), { code: "P2002" });
    (mockPrisma.importRecord.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        userId: "user_1",
        projectId: "p1",
        totalRows: 3,
        importedCount: 2,
        changes: [
          { changeType: "CREATED" },
          { changeType: "UPDATED" },
        ],
      });
    txMock.mockRejectedValueOnce(error);
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        requestId,
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      imported: 2,
      created: 1,
      updated: 1,
      unchanged: 1,
      errors: [],
    });
  });

  it("returns an idempotency conflict after a P2002 race won by another user", async () => {
    const error = Object.assign(new Error("Unique requestId"), { code: "P2002" });
    (mockPrisma.importRecord.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        userId: "another-user",
        projectId: "p1",
        totalRows: 1,
        importedCount: 1,
        changes: [],
      });
    txMock.mockRejectedValueOnce(error);
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        requestId,
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("falls back to a generic conflict when a P2002 winner cannot be found", async () => {
    const error = Object.assign(new Error("Unique requestId"), { code: "P2002" });
    (mockPrisma.importRecord.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    txMock.mockRejectedValueOnce(error);
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        requestId,
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("CONFLICT");
  });

  it("serializes a due date in the rollback snapshot for updated rows", async () => {
    const dueDate = new Date("2026-08-01T00:00:00.000Z");
    txFindMany.mockResolvedValue([{ ...existingCase(), dueDate }]);
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, rows: [validPreRow] }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(txImportChangeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changeType: "UPDATED",
        before: expect.objectContaining({ dueDate: dueDate.toISOString() }),
      }),
    });
  });

  it("does not consume or inspect an idempotency key during preview", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    const req = createRequest("/api/import", {
      method: "POST",
      body: JSON.stringify({
        ...basePayload,
        requestId,
        preview: true,
        rows: [validPreRow],
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.importRecord.findUnique).not.toHaveBeenCalled();
    expect(txMock).not.toHaveBeenCalled();
  });
});
