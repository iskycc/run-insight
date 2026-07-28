import { NextRequest, NextResponse } from "next/server";
import {
  GET as listJobs,
  POST as createJob,
} from "@/app/api/import-jobs/route";
import {
  DELETE as cancelJob,
  GET as getJob,
} from "@/app/api/import-jobs/[id]/route";
import { POST as retryJob } from "@/app/api/import-jobs/[id]/retry/route";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock("@/lib/project-access", () => ({
  getProjectAccess: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    importJob: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    batchScope: { findUnique: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const jobId = `c${"a".repeat(24)}`;
const otherJobId = `c${"b".repeat(24)}`;
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const now = new Date("2026-07-27T08:00:00.000Z");
const payload = {
  rows: [{ caseNo: "TC-1", name: "登录", resultSummary: "FAIL" }],
  importType: "pre-analysis",
  projectId: "project-1",
  testStageId: "stage-1",
  batchScopeId: "batch-1",
  fileName: "cases.csv",
  requestId,
};
const job = {
  id: jobId,
  ownerId: "user-1",
  projectId: "project-1",
  testStageId: "stage-1",
  batchScopeId: "batch-1",
  importRecordId: null,
  importType: "pre-analysis",
  fileName: "cases.csv",
  requestId,
  status: "PENDING" as const,
  progress: 0,
  totalRows: 1,
  processedRows: 0,
  errorCount: 0,
  errorSummary: null,
  errorDetails: null,
  payload,
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
const activeBatch = {
  projectId: "project-1",
  testStageId: "stage-1",
  archived: false,
  project: { archived: false },
  stage: { archived: false },
};

function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(new URL(path, "http://localhost"), {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params(id = jobId) {
  return { params: Promise.resolve({ id }) };
}

describe("import job APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "user-1",
      username: "alice",
    });
    (getProjectAccess as jest.Mock).mockResolvedValue({ canEdit: true });
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue(activeBatch);
    (mockPrisma.importJob.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.importJob.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.importJob.create as jest.Mock).mockResolvedValue(job);
    (mockPrisma.importJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it("returns authentication responses unchanged", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "未登录" },
        { status: 401 },
      ),
    );
    expect((await listJobs(request("/api/import-jobs"))).status).toBe(401);
  });

  it("rejects malformed JSON, unsupported media types, and unknown fields", async () => {
    const malformed = new NextRequest("http://localhost/api/import-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    });
    expect((await createJob(malformed)).status).toBe(400);

    const wrongType = request(
      "/api/import-jobs",
      "POST",
      payload,
      { "content-type": "text/plain" },
    );
    expect((await createJob(wrongType)).status).toBe(415);

    const unknown = await createJob(
      request("/api/import-jobs", "POST", { ...payload, unexpected: true }),
    );
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).message).toContain("unexpected");
  });

  it("enforces the 64MB payload and 100000 row limits", async () => {
    const tooLarge = request(
      "/api/import-jobs",
      "POST",
      payload,
      { "content-length": String(64 * 1024 * 1024 + 1) },
    );
    expect((await createJob(tooLarge)).status).toBe(413);

    const tooMany = await createJob(
      request("/api/import-jobs", "POST", {
        ...payload,
        rows: Array.from({ length: 100_001 }, () => ({})),
      }),
    );
    expect(tooMany.status).toBe(400);
  });

  it("rejects unauthorized and mismatched or archived targets", async () => {
    (getProjectAccess as jest.Mock).mockResolvedValueOnce({ canEdit: false });
    expect(
      (await createJob(request("/api/import-jobs", "POST", payload))).status,
    ).toBe(403);

    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValueOnce({
      ...activeBatch,
      projectId: "another-project",
    });
    expect(
      (await createJob(request("/api/import-jobs", "POST", payload))).status,
    ).toBe(400);

    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValueOnce({
      ...activeBatch,
      stage: { archived: true },
    });
    expect(
      (await createJob(request("/api/import-jobs", "POST", payload))).status,
    ).toBe(409);
  });

  it("creates a normalized job without returning its payload or claim token", async () => {
    const publicJob = { ...job };
    delete (publicJob as Partial<typeof job>).payload;
    delete (publicJob as Partial<typeof job>).claimToken;
    (mockPrisma.importJob.create as jest.Mock).mockResolvedValue(publicJob);

    const response = await createJob(
      request("/api/import-jobs", "POST", { ...payload, fileName: " cases.csv " }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.job.payload).toBeUndefined();
    expect(body.job.claimToken).toBeUndefined();
    expect(mockPrisma.importJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          totalRows: 1,
          fileName: "cases.csv",
        }),
        select: expect.objectContaining({ id: true, status: true }),
      }),
    );
  });

  it("replays a concurrent unique requestId winner and rejects a different scope", async () => {
    (mockPrisma.importJob.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(job);
    (mockPrisma.importJob.create as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    const replay = await createJob(
      request("/api/import-jobs", "POST", payload),
    );
    expect(replay.status).toBe(200);
    expect((await replay.json()).job.id).toBe(jobId);

    (mockPrisma.importJob.findUnique as jest.Mock).mockResolvedValueOnce({
      ...job,
      batchScopeId: "another-batch",
    });
    const conflict = await createJob(
      request("/api/import-jobs", "POST", payload),
    );
    expect(conflict.status).toBe(409);
  });

  it("scopes list and detail reads to the authenticated owner", async () => {
    await listJobs(request("/api/import-jobs"));
    expect(mockPrisma.importJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "user-1" } }),
    );

    (mockPrisma.importJob.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const hidden = await getJob(
      request(`/api/import-jobs/${otherJobId}`),
      params(otherJobId),
    );
    expect(hidden.status).toBe(404);
    expect(mockPrisma.importJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: otherJobId, ownerId: "user-1" },
      }),
    );
  });

  it("cancels pending work immediately and records active cancellation requests", async () => {
    (mockPrisma.importJob.findFirst as jest.Mock).mockResolvedValueOnce({
      id: jobId,
      status: "PENDING",
      claimToken: null,
      heartbeatAt: null,
    });
    const pending = await cancelJob(
      request(`/api/import-jobs/${jobId}`, "DELETE"),
      params(),
    );
    expect(pending.status).toBe(200);
    expect((await pending.json()).status).toBe("CANCELLED");

    (mockPrisma.importJob.findFirst as jest.Mock).mockResolvedValueOnce({
      id: jobId,
      status: "RUNNING",
      claimToken: "claim-1",
      heartbeatAt: new Date(),
    });
    const running = await cancelJob(
      request(`/api/import-jobs/${jobId}`, "DELETE"),
      params(),
    );
    expect(running.status).toBe(202);
    expect((await running.json()).message).toContain("实际结果");
  });

  it("only retries owned failed/cancelled jobs with current target permission", async () => {
    (mockPrisma.importJob.findFirst as jest.Mock).mockResolvedValueOnce({
      ...job,
      status: "FAILED",
    });
    const response = await retryJob(
      request(`/api/import-jobs/${jobId}/retry`, "POST"),
      params(),
    );
    expect(response.status).toBe(201);
    expect(mockPrisma.importJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          requestId: expect.any(String),
          payload: expect.objectContaining({
            ...payload,
            requestId: expect.any(String),
          }),
        }),
        omit: { payload: true, claimToken: true },
      }),
    );
    const retryCreate = (mockPrisma.importJob.create as jest.Mock).mock.calls[0][0];
    expect(retryCreate.data.requestId).not.toBe(requestId);
    expect(retryCreate.data.payload.requestId).toBe(retryCreate.data.requestId);

    (mockPrisma.importJob.findFirst as jest.Mock).mockResolvedValueOnce({
      ...job,
      status: "FAILED",
    });
    (getProjectAccess as jest.Mock).mockResolvedValueOnce({ canEdit: false });
    const forbidden = await retryJob(
      request(`/api/import-jobs/${jobId}/retry`, "POST"),
      params(),
    );
    expect(forbidden.status).toBe(403);
  });
});
