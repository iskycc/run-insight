import { POST } from "@/app/api/import-history/[id]/rollback/route";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const tx = {
  importRecord: { updateMany: jest.fn() },
  importChange: { findMany: jest.fn() },
  caseResult: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    importRecord: { findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  },
}));

jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const appliedAt = new Date("2026-07-25T01:00:00.000Z");
const beforeAt = new Date("2026-07-24T01:00:00.000Z");

function request() {
  return new NextRequest("http://localhost/api/import-history/import-1/rollback", {
    method: "POST",
  });
}

function snapshot() {
  return {
    caseNo: "TC-2",
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
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: beforeAt.toISOString(),
  };
}

describe("POST /api/import-history/[id]/rollback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({
      userId: "u1",
      username: "admin",
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue({
      id: "import-1",
      projectId: "p1",
      errorCount: 0,
      rolledBackAt: null,
    });
    tx.importRecord.updateMany.mockResolvedValue({ count: 1 });
    tx.importChange.findMany.mockResolvedValue([
      {
        id: "change-created",
        importRecordId: "import-1",
        caseResultId: "case-created",
        changeType: "CREATED",
        before: null,
        appliedUpdatedAt: appliedAt,
        createdAt: appliedAt,
      },
      {
        id: "change-updated",
        importRecordId: "import-1",
        caseResultId: "case-updated",
        changeType: "UPDATED",
        before: snapshot(),
        appliedUpdatedAt: appliedAt,
        createdAt: appliedAt,
      },
    ]);
    tx.caseResult.findMany.mockResolvedValue([
      { id: "case-created", updatedAt: appliedAt },
      { id: "case-updated", updatedAt: appliedAt },
    ]);
    tx.caseResult.deleteMany.mockResolvedValue({ count: 1 });
    tx.caseResult.updateMany.mockResolvedValue({ count: 1 });
  });

  it("deletes created cases, restores updated snapshots, and writes an audit log", async () => {
    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      rolledBack: true,
      deleted: 1,
      restored: 1,
    }));
    expect(tx.caseResult.deleteMany).toHaveBeenCalledWith({
      where: { id: "case-created", updatedAt: appliedAt },
    });
    expect(tx.caseResult.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case-updated", updatedAt: appliedAt },
        data: expect.objectContaining({
          name: "旧名称",
          resultSummary: "PASS",
          updatedAt: beforeAt,
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ROLLBACK",
        entityType: "import",
        entityId: "import-1",
      }),
    });
  });

  it("fails closed with 409 when any case changed after import", async () => {
    tx.caseResult.findMany.mockResolvedValue([
      { id: "case-created", updatedAt: new Date("2026-07-25T02:00:00.000Z") },
      { id: "case-updated", updatedAt: appliedAt },
    ]);

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(409);
    expect(tx.caseResult.deleteMany).not.toHaveBeenCalled();
    expect(tx.caseResult.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects an already rolled-back record", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue({
      id: "import-1",
      projectId: "p1",
      errorCount: 0,
      rolledBackAt: new Date(),
    });

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing import record", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await POST(request(), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects users without edit access", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects import records that contain validation errors", async () => {
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue({
      id: "import-1",
      projectId: "p1",
      errorCount: 2,
      rolledBackAt: null,
    });

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "ROLLBACK_NOT_ALLOWED",
      message: expect.any(String),
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when another request claims the rollback first", async () => {
    tx.importRecord.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(409);
    expect(tx.importChange.findMany).not.toHaveBeenCalled();
  });

  it("returns 409 when a changed case was deleted after import", async () => {
    tx.caseResult.findMany.mockResolvedValue([
      { id: "case-created", updatedAt: appliedAt },
    ]);

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(409);
    expect(tx.caseResult.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 409 when deleting a created case loses a race", async () => {
    tx.caseResult.deleteMany.mockResolvedValue({ count: 0 });

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(409);
    expect(tx.caseResult.updateMany).not.toHaveBeenCalled();
  });

  it.each([[null], [[]], ["invalid"]])(
    "returns 409 for an invalid updated-case snapshot %#",
    async (before) => {
      tx.importChange.findMany.mockResolvedValue([
        {
          caseResultId: "case-updated",
          changeType: "UPDATED",
          before,
          appliedUpdatedAt: appliedAt,
          createdAt: appliedAt,
        },
      ]);
      tx.caseResult.findMany.mockResolvedValue([
        { id: "case-updated", updatedAt: appliedAt },
      ]);

      const res = await POST(request(), {
        params: Promise.resolve({ id: "import-1" }),
      });

      expect(res.status).toBe(409);
      expect(tx.caseResult.updateMany).not.toHaveBeenCalled();
    },
  );

  it("restores non-null due dates from updated snapshots", async () => {
    const before = {
      ...snapshot(),
      dueDate: "2026-08-01T00:00:00.000Z",
    };
    tx.importChange.findMany.mockResolvedValue([
      {
        caseResultId: "case-updated",
        changeType: "UPDATED",
        before,
        appliedUpdatedAt: appliedAt,
        createdAt: appliedAt,
      },
    ]);
    tx.caseResult.findMany.mockResolvedValue([
      { id: "case-updated", updatedAt: appliedAt },
    ]);

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(200);
    expect(tx.caseResult.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dueDate: new Date("2026-08-01T00:00:00.000Z"),
        }),
      }),
    );
  });

  it("returns 409 when restoring an updated case loses a race", async () => {
    tx.importChange.findMany.mockResolvedValue([
      {
        caseResultId: "case-updated",
        changeType: "UPDATED",
        before: snapshot(),
        appliedUpdatedAt: appliedAt,
        createdAt: appliedAt,
      },
    ]);
    tx.caseResult.findMany.mockResolvedValue([
      { id: "case-updated", updatedAt: appliedAt },
    ]);
    tx.caseResult.updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(409);
  });

  it.each(["P2002", "P2003", "P2025"])(
    "maps Prisma %s conflicts to 409",
    async (code) => {
      const error = Object.assign(new Error("Prisma conflict"), { code });
      (mockPrisma.$transaction as jest.Mock).mockRejectedValueOnce(error);

      const res = await POST(request(), {
        params: Promise.resolve({ id: "import-1" }),
      });

      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("ROLLBACK_CONFLICT");
    },
  );

  it("returns 500 for an unexpected rollback error", async () => {
    (mockPrisma.$transaction as jest.Mock).mockRejectedValueOnce(
      new Error("DB error"),
    );

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(500);
  });

  it("requires authentication", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "未登录" },
        { status: 401 }
      )
    );

    const res = await POST(request(), {
      params: Promise.resolve({ id: "import-1" }),
    });

    expect(res.status).toBe(401);
  });
});
