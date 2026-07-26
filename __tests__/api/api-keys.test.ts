import { GET, POST } from "@/app/api/projects/[id]/api-keys/route";
import { DELETE } from "@/app/api/projects/[id]/api-keys/[keyId]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    apiKey: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    project: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({ writeAuditLog: jest.fn() }));

const context = { params: Promise.resolve({ id: "p1" }) };
const keyContext = {
  params: Promise.resolve({ id: "p1", keyId: "k1" }),
};
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-02T00:00:00.000Z");

function keyRecord(
  overrides: Partial<{
    id: string;
    prefix: string;
    description: string;
    scopes: unknown;
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: "k1",
    prefix: "ri_abcdefgh",
    description: "CI key",
    scopes: ["IMPORT"],
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    revokedAt: null,
    lastUsedAt: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function request(body?: unknown) {
  return new NextRequest("http://localhost/api/projects/p1/api-keys", {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("API Key management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({
      userId: "u1",
      username: "admin",
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
  });

  it("creates a scoped expiring key and returns the raw key exactly once", async () => {
    const record = keyRecord();
    (prisma.apiKey.create as jest.Mock).mockResolvedValue(record);

    const res = await POST(
      request({
        description: "  CI key  ",
        scopes: ["IMPORT"],
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
      context,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.key).toMatch(/^ri_[A-Za-z0-9_-]{43}$/);
    expect(body).toEqual(
      expect.objectContaining({
        prefix: "ri_abcdefgh",
        description: "CI key",
        scopes: ["IMPORT"],
        status: "ACTIVE",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    );

    const createData = (prisma.apiKey.create as jest.Mock).mock.calls[0][0]
      .data as { keyHash: string; prefix: string; description: string };
    expect(createData.keyHash).toBe(
      crypto.createHash("sha256").update(body.key).digest("hex"),
    );
    expect(createData.prefix).toBe(body.key.slice(0, 11));
    expect(createData.description).toBe("CI key");
    expect(body).not.toHaveProperty("keyHash");
    expect(writeAuditLog).toHaveBeenCalledWith({
      userId: "u1",
      action: "API_KEY_CREATE",
      entityType: "apiKey",
      entityId: "k1",
      changes: {
        projectId: "p1",
        prefix: "ri_abcdefgh",
        description: "CI key",
        scopes: ["IMPORT"],
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    });
    expect(writeAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          key: expect.anything(),
          keyHash: expect.anything(),
        }),
      }),
    );
  });

  it("lists prefixes, scopes and lifecycle status without raw key or hash", async () => {
    (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
      keyRecord({ id: "active" }),
      keyRecord({
        id: "expired",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      }),
      keyRecord({
        id: "revoked",
        revokedAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ]);

    const res = await GET(request(), context);
    const body = await res.json();

    expect(body.keys.map((key: { status: string }) => key.status)).toEqual([
      "ACTIVE",
      "EXPIRED",
      "REVOKED",
    ]);
    expect(body.keys[0]).toEqual(
      expect.objectContaining({
        prefix: "ri_abcdefgh",
        scopes: ["IMPORT"],
        lastUsedAt: null,
      }),
    );
    expect(body.keys[0]).not.toHaveProperty("key");
    expect(body.keys[0]).not.toHaveProperty("keyHash");
  });

  it.each([
    [{ description: "", scopes: ["IMPORT"] }, "描述不能为空"],
    [{ description: "CI", scopes: [] }, "权限范围"],
    [{ description: "CI", scopes: ["EXPORT"] }, "权限范围"],
    [{ description: "CI", scopes: ["IMPORT", "IMPORT"] }, "权限范围"],
    [
      {
        description: "CI",
        scopes: ["IMPORT"],
        expiresAt: "not-a-date",
      },
      "过期时间",
    ],
    [
      {
        description: "CI",
        scopes: ["IMPORT"],
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
      "过期时间",
    ],
    [
      {
        description: "CI",
        scopes: ["IMPORT"],
        expiresAt: "2099-02-30T00:00:00.000Z",
      },
      "过期时间",
    ],
    [
      { description: "CI", scopes: ["IMPORT"], unexpected: true },
      "不支持的字段",
    ],
  ])("rejects invalid creation payload %#", async (payload, message) => {
    const res = await POST(request(payload), context);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain(message);
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("requires a JSON Content-Type for key creation", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/projects/p1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: '{"description":"CI","scopes":["IMPORT"]}',
      }),
      context,
    );

    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toEqual({
      error: "UNSUPPORTED_MEDIA_TYPE",
      message: "Content-Type 必须为 application/json",
    });
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("revokes a key without physically deleting it and writes an audit log", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(keyRecord());
    (prisma.apiKey.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await DELETE(request(), keyContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      revoked: true,
      revokedAt: expect.any(String),
    });
    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: { id: "k1", projectId: "p1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(
      (prisma.apiKey as unknown as { delete?: jest.Mock }).delete,
    ).toBeUndefined();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "API_KEY_REVOKE",
        entityType: "apiKey",
        entityId: "k1",
        changes: expect.objectContaining({
          projectId: "p1",
          prefix: "ri_abcdefgh",
          scopes: ["IMPORT"],
          revokedAt: expect.any(String),
        }),
      }),
    );
  });

  it("returns conflict when a key is already revoked", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(
      keyRecord({ revokedAt: new Date() }),
    );

    const res = await DELETE(request(), keyContext);

    expect(res.status).toBe(409);
    expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("returns 403 for users without project administration permission", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });

    expect((await GET(request(), context)).status).toBe(403);
  });

  it("returns 404 when the project does not exist during creation", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(
      request({ description: "CI", scopes: ["IMPORT"], expiresAt: null }),
      context,
    );
    expect(res.status).toBe(404);
  });

  it("does not create credentials for an archived project", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      archived: true,
    });

    const res = await POST(
      request({ description: "CI", scopes: ["IMPORT"], expiresAt: null }),
      context,
    );

    expect(res.status).toBe(409);
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the key does not exist during revocation", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(null);
    expect((await DELETE(request(), keyContext)).status).toBe(404);
  });

  it("returns 500 when persistence fails", async () => {
    (prisma.apiKey.findMany as jest.Mock).mockRejectedValue(new Error("DB"));
    expect((await GET(request(), context)).status).toBe(500);

    (prisma.apiKey.create as jest.Mock).mockRejectedValue(new Error("DB"));
    expect(
      (
        await POST(
          request({
            description: "CI",
            scopes: ["IMPORT"],
            expiresAt: null,
          }),
          context,
        )
      ).status,
    ).toBe(500);

    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(keyRecord());
    (prisma.apiKey.updateMany as jest.Mock).mockRejectedValue(new Error("DB"));
    expect((await DELETE(request(), keyContext)).status).toBe(500);
  });

  it.each(["GET", "POST", "DELETE"])(
    "returns 401 for unauthenticated %s",
    async (method) => {
      (authenticateRequest as jest.Mock).mockReturnValue(
        NextResponse.json(
          { error: "UNAUTHORIZED", message: "未登录" },
          { status: 401 },
        ),
      );
      const response =
        method === "GET"
          ? await GET(request(), context)
          : method === "POST"
            ? await POST(
                request({
                  description: "CI",
                  scopes: ["IMPORT"],
                  expiresAt: null,
                }),
                context,
              )
            : await DELETE(request(), keyContext);
      expect(response.status).toBe(401);
    },
  );
});
