import { POST } from "@/app/api/import/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import crypto from "crypto";

jest.mock("@/lib/prisma", () => {
  const mockTx = {
    caseResult: { findMany: jest.fn(), upsert: jest.fn() },
    importRecord: { create: jest.fn(), update: jest.fn() },
    importChange: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    prisma: {
      user: { findUnique: jest.fn() },
      apiKey: { findFirst: jest.fn() },
      batchScope: { findUnique: jest.fn() },
      caseResult: { createMany: jest.fn(), upsert: jest.fn() },
      importRecord: { create: jest.fn(), findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(
        async (callback: (transaction: typeof mockTx) => Promise<unknown>) =>
          callback(mockTx)
      ),
    },
  };
});
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.fn(),
  authenticateApiKey: jest.requireActual("@/lib/auth").authenticateApiKey,
}));

const txMock = (prisma as unknown as { $transaction: jest.Mock }).$transaction;

function mockTransaction() {
  const txFindMany = jest.fn().mockResolvedValue([]);
  const txUpsert = jest.fn().mockResolvedValue({
    id: "case-1",
    updatedAt: new Date(),
  });
  const txImportCreate = jest.fn().mockResolvedValue({ id: "import-1" });
  const txImportUpdate = jest.fn().mockResolvedValue({});
  const txImportChangeCreate = jest.fn().mockResolvedValue({});
  const txAuditCreate = jest.fn().mockResolvedValue({});
  txMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      caseResult: { findMany: txFindMany, upsert: txUpsert },
      importRecord: { create: txImportCreate, update: txImportUpdate },
      importChange: { create: txImportChangeCreate },
      auditLog: { create: txAuditCreate },
    })
  );
  return {
    txFindMany,
    txUpsert,
    txImportCreate,
    txImportUpdate,
    txImportChangeCreate,
    txAuditCreate,
  };
}

describe("Import with API Key", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should accept X-API-Key header and skip JWT", async () => {
    const rawKey = crypto.randomBytes(32).toString("hex");
    const _keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue({ projectId: "p1", userId: "u-api" });
    (prisma.batchScope.findUnique as jest.Mock).mockResolvedValue({ id: "b1", testStageId: "s1", projectId: "p1" });
    mockTransaction();

    const headers = new Headers();
    headers.set("x-api-key", rawKey);
    headers.set("content-type", "application/json");

    const req = {
      url: "http://localhost/api/import",
      headers,
      json: async () => ({
        rows: [{ caseNo: "TC001", name: "Test", resultSummary: "PASS" }],
        importType: "pre-analysis",
        projectId: "p1",
        testStageId: "s1",
        batchScopeId: "b1",
        fileName: "test.csv",
      }),
    } as unknown as Request;

    const res = await POST(req as any);
    expect(res.status).toBe(201);
    expect(authenticateRequest).not.toHaveBeenCalled();
  });

  it("should fall back to JWT when no API key", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(null);
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (prisma.batchScope.findUnique as jest.Mock).mockResolvedValue({ id: "b1", testStageId: "s1", projectId: "p1" });
    mockTransaction();

    const req = {
      url: "http://localhost/api/import",
      headers: new Headers(),
      json: async () => ({
        rows: [{ caseNo: "TC001", name: "Test", resultSummary: "PASS" }],
        importType: "pre-analysis",
        projectId: "p1",
        testStageId: "s1",
        batchScopeId: "b1",
        fileName: "test.csv",
      }),
    } as unknown as Request;

    const res = await POST(req as any);
    expect(res.status).toBe(201);
    expect(authenticateRequest).toHaveBeenCalled();
  });

  it("should reject an invalid API key without falling back to JWT", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(null);
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });

    const headers = new Headers();
    headers.set("x-api-key", "invalid-key");
    headers.set("cookie", "run_insight_token=valid-cookie-token");

    const req = {
      url: "http://localhost/api/import",
      headers,
      json: async () => ({
        rows: [{ caseNo: "TC001", name: "Test", resultSummary: "PASS" }],
        importType: "pre-analysis",
        projectId: "p1",
        testStageId: "s1",
        batchScopeId: "b1",
      }),
    } as unknown as Request;

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "UNAUTHORIZED",
      message: "API Key 无效",
    });
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(prisma.batchScope.findUnique).not.toHaveBeenCalled();
  });

  it("should reject an API key used for a different project", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue({
      projectId: "p-key-project",
      userId: "u-api",
    });

    const headers = new Headers();
    headers.set("x-api-key", "project-scoped-key");

    const req = {
      url: "http://localhost/api/import",
      headers,
      json: async () => ({
        rows: [{ caseNo: "TC001", name: "Test", resultSummary: "PASS" }],
        importType: "pre-analysis",
        projectId: "p-other-project",
        testStageId: "s1",
        batchScopeId: "b1",
      }),
    } as unknown as Request;

    const res = await POST(req as any);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "FORBIDDEN",
      message: "API Key 无权访问该项目",
    });
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(prisma.batchScope.findUnique).not.toHaveBeenCalled();
  });
});
