import { PATCH as saveAsset } from "@/app/api/cases/[id]/save-asset/route";
import { POST as batchSaveAsset } from "@/app/api/cases/batch-save-asset/route";
import { generateToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => {
  const tx = {
    asset: { upsert: jest.fn() },
    caseResult: { update: jest.fn(), updateMany: jest.fn() },
  };
  const client = {
    user: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    caseResult: { findUnique: jest.fn(), findMany: jest.fn() },
    asset: tx.asset,
    $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    __tx: tx,
  };
  return { prisma: client };
});

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const validId = "clxxxxxxxxxxxxxxxxxxxxxx1";
const now = new Date("2026-07-25T00:00:00.000Z");
const caseResult = {
  id: validId,
  caseNo: "TC-1",
  name: "登录",
  resultSummary: "FAIL",
  logUrl: null,
  projectId: "project_1",
  testStageId: "stage_1",
  batchScopeId: "batch_1",
  assignee: "admin",
  assigneeId: "user_1",
  priority: "HIGH" as const,
  dueDate: null,
  progressCategory: "LOCATED",
  rootCause: "空指针",
  rootCauseCategoryId: "root_1",
  mrOrTicket: "MR-1",
  notes: "增加空值判断",
  assetSaved: false,
  updatedBy: "user_1",
  createdAt: now,
  updatedAt: now,
};
const asset = {
  id: "asset_1",
  sourceCaseId: validId,
  projectId: "project_1",
  rootCauseCategoryId: "root_1",
  title: "登录",
  summary: "摘要",
  solution: "增加空值判断",
  rootCauseText: "空指针",
  tags: [],
  status: "DRAFT" as const,
  version: 1,
  createdBy: "user_1",
  updatedBy: "user_1",
  viewCount: 0,
  reuseCount: 0,
  createdAt: now,
  updatedAt: now,
  project: { id: "project_1", name: "项目一" },
  rootCauseCategory: { id: "root_1", name: "代码缺陷" },
  sourceCase: {
    id: validId,
    caseNo: "TC-1",
    name: "登录",
    resultSummary: "FAIL",
  },
  creator: { username: "admin" },
  updater: { username: "admin" },
};

function request(path: string, body?: unknown) {
  const req = new NextRequest(new URL(path, "http://localhost"), {
    method: body === undefined ? "PATCH" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  req.headers.set(
    "cookie",
    `run_insight_token=${generateToken({ userId: "user_1", username: "admin" })}`
  );
  return req;
}

describe("save asset APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
  });

  it("creates an independent snapshot and keeps the compatibility flag", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(caseResult);
    (mockPrisma.asset.upsert as jest.Mock).mockResolvedValue(asset);
    const tx = (mockPrisma as unknown as { __tx: {
      caseResult: { update: jest.Mock };
    } }).__tx;
    tx.caseResult.update.mockResolvedValue({
      ...caseResult,
      assetSaved: true,
      assigneeUser: { username: "admin" },
      rootCauseCategory: { id: "root_1", name: "代码缺陷" },
    });

    const response = await saveAsset(request(`/api/cases/${validId}/save-asset`), {
      params: Promise.resolve({ id: validId }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).asset.id).toBe("asset_1");
    expect(mockPrisma.asset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceCaseId: validId },
        create: expect.objectContaining({
          sourceCaseId: validId,
          title: "登录",
          status: "DRAFT",
        }),
        update: {},
      })
    );
  });

  it("does not overwrite curated fields when saving an existing asset again", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue({
      ...caseResult,
      assetSaved: true,
      name: "来源名称已变化",
      notes: "来源方案已变化",
    });
    (mockPrisma.asset.upsert as jest.Mock).mockResolvedValue({
      ...asset,
      title: "人工维护标题",
      solution: "人工维护方案",
    });
    const tx = (mockPrisma as unknown as { __tx: {
      caseResult: { update: jest.Mock };
    } }).__tx;
    tx.caseResult.update.mockResolvedValue({
      ...caseResult,
      assetSaved: true,
      assigneeUser: { username: "admin" },
      rootCauseCategory: { id: "root_1", name: "代码缺陷" },
    });

    const response = await saveAsset(request(`/api/cases/${validId}/save-asset`), {
      params: Promise.resolve({ id: validId }),
    });

    expect(response.status).toBe(200);
    expect(mockPrisma.asset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} })
    );
    expect((await response.json()).asset.title).toBe("人工维护标题");
  });

  it("requires analysis progress before saving", async () => {
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue({
      ...caseResult,
      progressCategory: null,
    });
    const response = await saveAsset(request(`/api/cases/${validId}/save-asset`), {
      params: Promise.resolve({ id: validId }),
    });
    expect(response.status).toBe(400);
  });

  it("checks project edit permission", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.caseResult.findUnique as jest.Mock).mockResolvedValue(caseResult);
    const response = await saveAsset(request(`/api/cases/${validId}/save-asset`), {
      params: Promise.resolve({ id: validId }),
    });
    expect(response.status).toBe(403);
  });

  it("batch upserts snapshots in a transaction", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      caseResult,
      { ...caseResult, id: "clxxxxxxxxxxxxxxxxxxxxxx2", caseNo: "TC-2" },
    ]);
    const tx = (mockPrisma as unknown as { __tx: {
      caseResult: { updateMany: jest.Mock };
    } }).__tx;
    tx.caseResult.updateMany.mockResolvedValue({ count: 2 });

    const response = await batchSaveAsset(
      request("/api/cases/batch-save-asset", {
        caseIds: [validId, "clxxxxxxxxxxxxxxxxxxxxxx2"],
      })
    );
    expect(response.status).toBe(200);
    expect((await response.json()).updated).toBe(2);
    expect(mockPrisma.asset.upsert).toHaveBeenCalledTimes(2);
  });

  it("rejects missing cases during batch save", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    const response = await batchSaveAsset(
      request("/api/cases/batch-save-asset", { caseIds: [validId] })
    );
    expect(response.status).toBe(404);
  });
});
