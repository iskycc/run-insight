import { PATCH, DELETE } from "@/app/api/batches/[id]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    projectMember: { findUnique: jest.fn() },
    batchScope: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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

describe("PATCH /api/batches/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("returns 401 without auth", async () => {
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 if batch not found", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(404);
  });

  it("rejects a non-object request body", async () => {
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: "null",
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(400);
    expect(mockPrisma.batchScope.findUnique).not.toHaveBeenCalled();
  });

  it("archives a batch and returns it", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({ id: "b1" });
    (mockPrisma.batchScope.update as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Batch-1",
      archived: true,
      executedAt: new Date("2026-01-01"),
      startedAt: null,
      finishedAt: null,
      environment: null,
      buildVersion: null,
      commitSha: null,
      pipelineUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });

    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(true);
  });

  it("blocks metadata changes to an archived batch", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      archived: true,
      project: { archived: false },
      stage: { archived: false },
      startedAt: null,
      finishedAt: null,
    });
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ environment: "PROD" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(409);
    expect(mockPrisma.batchScope.update).not.toHaveBeenCalled();
  });

  it("does not restore a batch while its parent stage is archived", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      archived: true,
      project: { archived: false },
      stage: { archived: true },
      startedAt: null,
      finishedAt: null,
    });
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ archived: false }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(409);
    expect(mockPrisma.batchScope.update).not.toHaveBeenCalled();
  });

  it("updates batch execution metadata", async () => {
    const executedAt = new Date("2026-07-26T02:30:00.000Z");
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      startedAt: null,
      finishedAt: null,
    });
    (mockPrisma.batchScope.update as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Release 2.1",
      archived: false,
      executedAt,
      startedAt: null,
      finishedAt: null,
      environment: "UAT",
      buildVersion: "2.1.0",
      commitSha: null,
      pipelineUrl: null,
      createdAt: executedAt,
      updatedAt: executedAt,
    });

    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Release 2.1",
        executedAt: executedAt.toISOString(),
        environment: "UAT",
        buildVersion: "2.1.0",
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.batchScope.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({
        name: "Release 2.1",
        executedAt,
        environment: "UAT",
        buildVersion: "2.1.0",
      }),
    });
  });

  it("preserves omitted fields during a partial update", async () => {
    const executedAt = new Date("2026-07-26T02:30:00.000Z");
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      startedAt: null,
      finishedAt: null,
    });
    (mockPrisma.batchScope.update as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Release 2.1",
      archived: false,
      executedAt,
      startedAt: null,
      finishedAt: null,
      environment: "PROD",
      buildVersion: "2.1.0",
      commitSha: "abcdef1",
      pipelineUrl: null,
      createdAt: executedAt,
      updatedAt: executedAt,
    });
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ environment: " PROD " }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.batchScope.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { environment: "PROD" },
    });
  });

  it("clears nullable metadata without clearing omitted fields", async () => {
    const executedAt = new Date("2026-07-26T02:30:00.000Z");
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      startedAt: null,
      finishedAt: null,
    });
    (mockPrisma.batchScope.update as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Release 2.1",
      archived: false,
      executedAt,
      startedAt: null,
      finishedAt: null,
      environment: null,
      buildVersion: "2.1.0",
      commitSha: null,
      pipelineUrl: null,
      createdAt: executedAt,
      updatedAt: executedAt,
    });
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ environment: "   ", pipelineUrl: "" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.batchScope.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { environment: null, pipelineUrl: null },
    });
  });

  it.each([
    [
      { executedAt: null },
      "执行时间不能为空",
    ],
    [
      { executedAt: "2026-07-26T10:00:00" },
      "执行时间格式不正确，必须包含时区",
    ],
    [
      { executedAt: "2026-02-30T10:00:00Z" },
      "执行时间格式不正确，必须包含时区",
    ],
    [
      { commitSha: "xyz" },
      "Commit SHA 格式不正确",
    ],
    [
      { pipelineUrl: "file:///tmp/build" },
      "日志链接必须为 HTTP/HTTPS 链接",
    ],
  ])("rejects invalid partial metadata %#", async (payload, message) => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      startedAt: null,
      finishedAt: null,
    });
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message,
    });
    expect(mockPrisma.batchScope.update).not.toHaveBeenCalled();
  });

  it("rejects an end time earlier than the start time", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      startedAt: null,
      finishedAt: null,
    });
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({
        startedAt: "2026-07-26T10:00:00.000Z",
        finishedAt: "2026-07-26T09:00:00.000Z",
      }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(400);
    expect(mockPrisma.batchScope.update).not.toHaveBeenCalled();
  });

  it("validates a new start time against the existing finish time", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      startedAt: null,
      finishedAt: new Date("2026-07-26T09:00:00.000Z"),
    });
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ startedAt: "2026-07-26T10:00:00.000Z" }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(400);
    expect(mockPrisma.batchScope.update).not.toHaveBeenCalled();
  });

  it("returns 500 on database error", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));
    const req = createRequest("/api/batches/b1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/batches/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("returns 401 without auth", async () => {
    const req = createRequest("/api/batches/b1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is insufficient", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
    });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/batches/b1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 if batch not found", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue(null);
    const req = createRequest("/api/batches/b1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(404);
  });

  it("moves a batch to trash without physically deleting it", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Batch-1",
      archived: false,
    });
    (mockPrisma.batchScope.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const req = createRequest("/api/batches/b1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      deleted: true,
      archived: true,
      permanent: false,
    });
    expect(mockPrisma.batchScope.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { archived: true },
    });
    expect(mockPrisma.batchScope.delete).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ARCHIVE" }),
    });
  });

  it("allows a project editor to move a batch to trash", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Batch-1",
      archived: false,
    });
    const req = createRequest("/api/batches/b1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.batchScope.update).toHaveBeenCalled();
    expect(mockPrisma.batchScope.delete).not.toHaveBeenCalled();
  });

  it("rejects permanent deletion of an active batch", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Batch-1",
      archived: false,
    });
    const req = createRequest("/api/batches/b1?permanent=true", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(409);
    expect(mockPrisma.batchScope.delete).not.toHaveBeenCalled();
  });

  it("permanently deletes an archived batch for a project admin", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Batch-1",
      archived: true,
    });
    const req = createRequest("/api/batches/b1?permanent=true", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true, permanent: true });
    expect(mockPrisma.batchScope.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "DELETE" }),
    });
  });

  it("rejects permanent deletion of a batch by a project editor", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      projectId: "p1",
      testStageId: "s1",
      name: "Batch-1",
      archived: true,
    });
    const req = createRequest("/api/batches/b1?permanent=true", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(403);
    expect(mockPrisma.batchScope.delete).not.toHaveBeenCalled();
  });

  it("returns 500 on database error", async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));
    const req = createRequest("/api/batches/b1", {
      method: "DELETE",
      headers: { cookie: authCookie() },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(500);
  });
});
