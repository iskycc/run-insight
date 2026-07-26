import { GET as listVersions } from "@/app/api/assets/[id]/versions/route";
import { GET as getVersion } from "@/app/api/assets/[id]/versions/[version]/route";
import { POST as rollbackVersion } from "@/app/api/assets/[id]/versions/[version]/rollback/route";
import { generateToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => {
  const asset = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const assetVersion = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  return {
    prisma: {
      user: { findUnique: jest.fn() },
      projectMember: { findUnique: jest.fn() },
      asset,
      assetVersion,
      $transaction: jest.fn(
        async (
          callback: (tx: {
            asset: typeof asset;
            assetVersion: typeof assetVersion;
          }) => Promise<unknown>,
        ) => callback({ asset, assetVersion }),
      ),
    },
  };
});
jest.mock("@/lib/audit", () => ({ writeAuditLog: jest.fn() }));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const assetId = "asset-1";
const createdAt = new Date("2026-07-27T00:00:00.000Z");
const params = { params: Promise.resolve({ id: assetId }) };

function request(path: string, method = "GET") {
  const request = new NextRequest(new URL(path, "http://localhost"), {
    method,
  });
  request.headers.set(
    "cookie",
    `run_insight_token=${generateToken({
      userId: "user-1",
      username: "editor",
    })}`,
  );
  return request;
}

function version(
  number: number,
  overrides: Partial<{
    title: string;
    summary: string;
    solution: string;
    rootCauseText: string | null;
    tags: string[];
    status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
  }> = {},
) {
  return {
    id: `version-${number}`,
    assetId,
    version: number,
    title: "登录失败分析",
    summary: number === 1 ? "旧摘要" : "新摘要",
    solution: "修复空值处理",
    rootCauseText: "空指针",
    tags: ["登录"],
    status: "DRAFT" as const,
    changedBy: "user-1",
    author: { username: "editor" },
    createdAt,
    ...overrides,
  };
}

function assetAccess(
  overrides: Partial<{
    status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
    version: number;
  }> = {},
) {
  return {
    id: assetId,
    projectId: "project-1",
    status: "DRAFT" as const,
    version: 2,
    ...overrides,
  };
}

function updatedAsset() {
  return {
    ...assetAccess({ version: 3 }),
    sourceCaseId: null,
    rootCauseCategoryId: null,
    title: "登录失败分析",
    summary: "旧摘要",
    solution: "修复空值处理",
    rootCauseText: "空指针",
    tags: ["登录"],
    createdBy: "user-1",
    updatedBy: "user-1",
    viewCount: 0,
    reuseCount: 0,
    createdAt,
    updatedAt: createdAt,
    project: { id: "project-1", name: "项目一" },
    rootCauseCategory: null,
    sourceCase: null,
    creator: { username: "editor" },
    updater: { username: "editor" },
  };
}

describe("asset version APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(assetAccess());
  });

  it("lists immutable versions for project editors", async () => {
    (mockPrisma.assetVersion.findMany as jest.Mock).mockResolvedValue([
      version(2),
      version(1),
    ]);

    const response = await listVersions(
      request(`/api/assets/${assetId}/versions`),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.versions.map((item: { version: number }) => item.version))
      .toEqual([2, 1]);
    expect(body.canRollback).toBe(true);
    expect(mockPrisma.assetVersion.findMany).toHaveBeenCalledWith({
      where: { assetId },
      include: { author: { select: { username: true } } },
      orderBy: { version: "desc" },
    });
  });

  it("does not expose historical drafts to project viewers", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });

    const response = await listVersions(
      request(`/api/assets/${assetId}/versions`),
      params,
    );

    expect(response.status).toBe(403);
    expect(mockPrisma.assetVersion.findMany).not.toHaveBeenCalled();
  });

  it("returns a field-level diff against the preceding version", async () => {
    (mockPrisma.assetVersion.findUnique as jest.Mock).mockResolvedValue(
      version(2),
    );
    (mockPrisma.assetVersion.findFirst as jest.Mock).mockResolvedValue(
      version(1),
    );

    const response = await getVersion(
      request(`/api/assets/${assetId}/versions/2`),
      { params: Promise.resolve({ id: assetId, version: "2" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.compareTo.version).toBe(1);
    expect(body.changes).toEqual([
      expect.objectContaining({
        field: "summary",
        before: "旧摘要",
        after: "新摘要",
      }),
    ]);
  });

  it("rolls historical content into a new draft version", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    (mockPrisma.assetVersion.findUnique as jest.Mock).mockResolvedValue(
      version(1, { status: "PUBLISHED" }),
    );
    (mockPrisma.asset.update as jest.Mock).mockResolvedValue(updatedAsset());

    const response = await rollbackVersion(
      request(`/api/assets/${assetId}/versions/1/rollback`, "POST"),
      { params: Promise.resolve({ id: assetId, version: "1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summary: "旧摘要",
          status: "DRAFT",
          version: { increment: 1 },
        }),
      }),
    );
    expect(mockPrisma.assetVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId,
        version: 3,
        status: "DRAFT",
      }),
    });
  });

  it("rejects rollback to the current version", async () => {
    const response = await rollbackVersion(
      request(`/api/assets/${assetId}/versions/2/rollback`, "POST"),
      { params: Promise.resolve({ id: assetId, version: "2" }) },
    );
    expect(response.status).toBe(409);
    expect(mockPrisma.assetVersion.findUnique).not.toHaveBeenCalled();
  });

  it("requires a project administrator to roll back published knowledge", async () => {
    (mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(
      assetAccess({ status: "PUBLISHED" }),
    );

    const response = await rollbackVersion(
      request(`/api/assets/${assetId}/versions/1/rollback`, "POST"),
      { params: Promise.resolve({ id: assetId, version: "1" }) },
    );

    expect(response.status).toBe(403);
    expect(mockPrisma.assetVersion.findUnique).not.toHaveBeenCalled();
  });
});
