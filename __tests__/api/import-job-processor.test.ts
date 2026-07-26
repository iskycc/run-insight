import { NextRequest, NextResponse } from "next/server";
import { POST as processJobs } from "@/app/api/cron/import-jobs/process/route";
import { POST as runImport } from "@/app/api/import/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/app/api/import/route", () => ({
  POST: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    importJob: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    importRecord: { findUnique: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedRunImport = runImport as jest.MockedFunction<typeof runImport>;
const now = new Date("2026-07-27T08:00:00.000Z");
const candidate = {
  id: "job-1",
  ownerId: "user-1",
  projectId: "project-1",
  testStageId: "stage-1",
  batchScopeId: "batch-1",
  importRecordId: null,
  importType: "pre-analysis",
  fileName: "cases.csv",
  requestId: "123e4567-e89b-42d3-a456-426614174000",
  status: "PENDING" as const,
  progress: 0,
  totalRows: 2,
  processedRows: 0,
  errorCount: 0,
  errorSummary: null,
  errorDetails: null,
  payload: {
    rows: [
      { caseNo: "TC-1", name: "A", resultSummary: "PASS" },
      { caseNo: "TC-2", name: "B", resultSummary: "FAIL" },
    ],
    projectId: "project-1",
    testStageId: "stage-1",
    batchScopeId: "batch-1",
    importType: "pre-analysis",
    requestId: "123e4567-e89b-42d3-a456-426614174000",
  },
  attempts: 0,
  claimToken: null,
  claimedAt: null,
  heartbeatAt: null,
  cancelRequested: false,
  startedAt: null,
  finishedAt: null,
  createdAt: now,
  updatedAt: now,
};

function request(secret = "processor-secret") {
  return new NextRequest("http://localhost/api/cron/import-jobs/process", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("import job processor", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = "processor-secret";
    (mockPrisma.importJob.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    (mockPrisma.importJob.findFirst as jest.Mock).mockResolvedValue(candidate);
    (mockPrisma.importJob.findUnique as jest.Mock).mockResolvedValue(candidate);
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue({
      id: "record-1",
    });
    mockedRunImport.mockResolvedValue(
      NextResponse.json(
        { imported: 2, created: 2, updated: 0, unchanged: 0, errors: [] },
        { status: 201 },
      ),
    );
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("uses a constant-time secret check and rejects missing or wrong secrets", async () => {
    expect((await processJobs(request("wrong"))).status).toBe(401);
    expect(mockPrisma.importJob.findFirst).not.toHaveBeenCalled();

    delete process.env.CRON_SECRET;
    expect((await processJobs(request())).status).toBe(401);
  });

  it("claims and completes one job, linking its import record", async () => {
    const response = await processJobs(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: true,
      status: "SUCCEEDED",
    });
    expect(mockedRunImport).toHaveBeenCalledTimes(1);
    const internalRequest = mockedRunImport.mock.calls[0][0];
    expect(internalRequest.headers.get("x-import-owner-id")).toBe("user-1");
    expect(internalRequest.headers.get("x-import-worker-secret")).toBe(
      "processor-secret",
    );
    expect(mockPrisma.importJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "job-1",
          status: "RUNNING",
        }),
        data: expect.objectContaining({
          status: "SUCCEEDED",
          progress: 100,
          processedRows: 2,
          importRecordId: "record-1",
        }),
      }),
    );
  });

  it("lets only one competing worker claim a candidate", async () => {
    (mockPrisma.importJob.updateMany as jest.Mock).mockReset();
    (mockPrisma.importJob.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 0 });
    (mockPrisma.importJob.findFirst as jest.Mock)
      .mockResolvedValueOnce(candidate)
      .mockResolvedValueOnce(null);

    const response = await processJobs(request());
    expect(await response.json()).toEqual({ processed: false, raced: true });
    expect(mockedRunImport).not.toHaveBeenCalled();
  });

  it("reclaims stale work using the prior claim token and preserves startedAt", async () => {
    const startedAt = new Date("2026-07-27T07:00:00.000Z");
    const stale = {
      ...candidate,
      status: "RUNNING" as const,
      claimToken: "old-claim",
      heartbeatAt: new Date("2026-07-27T07:30:00.000Z"),
      startedAt,
    };
    (mockPrisma.importJob.findFirst as jest.Mock).mockResolvedValue(stale);
    (mockPrisma.importJob.findUnique as jest.Mock).mockResolvedValue(stale);

    await processJobs(request());
    expect(mockPrisma.importJob.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          status: "RUNNING",
          claimToken: "old-claim",
        }),
        data: expect.objectContaining({
          status: "RUNNING",
          startedAt,
          attempts: { increment: 1 },
        }),
      }),
    );
  });

  it("cancels before the transaction but keeps the actual result after it starts", async () => {
    (mockPrisma.importJob.findUnique as jest.Mock).mockResolvedValueOnce({
      ...candidate,
      status: "RUNNING",
      cancelRequested: true,
    });
    const cancelled = await processJobs(request());
    expect((await cancelled.json()).status).toBe("CANCELLED");
    expect(mockedRunImport).not.toHaveBeenCalled();

    jest.clearAllMocks();
    (mockPrisma.importJob.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    (mockPrisma.importJob.findFirst as jest.Mock).mockResolvedValue(candidate);
    (mockPrisma.importJob.findUnique as jest.Mock).mockResolvedValue(candidate);
    (mockPrisma.importRecord.findUnique as jest.Mock).mockResolvedValue({
      id: "record-1",
    });
    mockedRunImport.mockResolvedValue(
      NextResponse.json(
        {
          imported: 2,
          created: 2,
          updated: 0,
          unchanged: 0,
          errors: [],
        },
        { status: 201 },
      ),
    );
    const completed = await processJobs(request());
    expect((await completed.json()).status).toBe("SUCCEEDED");
  });

  it("persists bounded validation details when import fails", async () => {
    mockedRunImport.mockResolvedValue(
      NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "数据校验失败",
          details: [{ row: 2, field: "caseNo", message: "不能为空" }],
        },
        { status: 400 },
      ),
    );

    const response = await processJobs(request());
    expect((await response.json()).status).toBe("FAILED");
    expect(mockPrisma.importJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorSummary: "数据校验失败",
          errorCount: 1,
          errorDetails: [{ row: 2, field: "caseNo", message: "不能为空" }],
        }),
      }),
    );
  });
});
