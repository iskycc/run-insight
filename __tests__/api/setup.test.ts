import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/setup/route";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSetupRateLimit } from "@/lib/rate-limiter";

jest.mock("@/lib/auth", () => ({
  hashPassword: jest.fn(async (password: string) => `hashed:${password}`),
}));

jest.mock("@/lib/rate-limiter", () => ({
  checkSetupRateLimit: jest.fn(),
}));

const tx = {
  instanceSetup: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  organization: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  organizationMember: {
    createMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    instanceSetup: {
      findUnique: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const setupToken = "setup-token-2026-very-long-and-random-value";
const originalSetupToken = process.env.INSTANCE_SETUP_TOKEN;

const validBody = {
  setupToken,
  adminUsername: "admin",
  adminPassword: "admin-password-2026",
  viewerUsername: "viewer",
  viewerPassword: "viewer-password-2026",
};

function request(
  body: unknown = validBody,
  contentType = "application/json",
) {
  return new NextRequest("http://localhost/api/setup", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("/api/setup", () => {
  beforeEach(() => {
    process.env.INSTANCE_SETUP_TOKEN = setupToken;
    (hashPassword as jest.Mock).mockReset();
    (hashPassword as jest.Mock).mockImplementation(
      async (password: string) => `hashed:${password}`,
    );
    (checkSetupRateLimit as jest.Mock).mockReset();
    (mockPrisma.instanceSetup.findUnique as jest.Mock).mockReset();
    (mockPrisma.user.findFirst as jest.Mock).mockReset();
    (mockPrisma.$transaction as jest.Mock).mockReset();
    for (const delegate of Object.values(tx)) {
      for (const method of Object.values(delegate)) {
        method.mockReset();
      }
    }

    (mockPrisma.instanceSetup.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (checkSetupRateLimit as jest.Mock).mockResolvedValue(null);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    tx.instanceSetup.findUnique.mockResolvedValue(null);
    tx.instanceSetup.create.mockResolvedValue({
      id: 1,
      initializedAt: new Date(),
    });
    tx.user.findFirst.mockResolvedValue(null);
    tx.user.create
      .mockResolvedValueOnce({ id: "admin-id" })
      .mockResolvedValueOnce({ id: "viewer-id" });
    tx.organization.findFirst.mockResolvedValue({
      id: "organization-id",
      archived: false,
    });
    tx.organization.create.mockResolvedValue({
      id: "organization-id",
      archived: false,
    });
    tx.organization.update.mockResolvedValue({
      id: "organization-id",
      archived: false,
    });
    tx.organizationMember.createMany.mockResolvedValue({ count: 2 });
    tx.auditLog.create.mockResolvedValue({ id: "audit-id" });
  });

  afterAll(() => {
    if (originalSetupToken === undefined) {
      delete process.env.INSTANCE_SETUP_TOKEN;
    } else {
      process.env.INSTANCE_SETUP_TOKEN = originalSetupToken;
    }
  });

  it("reports a marker-backed initialized instance without querying users", async () => {
    (mockPrisma.instanceSetup.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      initialized: true,
      setupAvailable: true,
    });
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("treats legacy users as initialized even without a marker", async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: "u1" });

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      initialized: true,
      setupAvailable: true,
    });
  });

  it("reports a fresh instance as uninitialized", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      initialized: false,
      setupAvailable: true,
    });
  });

  it("reports setup as unavailable when the bootstrap token is missing", async () => {
    delete process.env.INSTANCE_SETUP_TOKEN;

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      initialized: false,
      setupAvailable: false,
    });
  });

  it("returns a controlled error when setup status cannot be read", async () => {
    (mockPrisma.instanceSetup.findUnique as jest.Mock).mockRejectedValue(
      new Error("database unavailable"),
    );
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "INTERNAL_ERROR" }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    consoleSpy.mockRestore();
  });

  it("rejects setup immediately when the instance already has users", async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: "u1" });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(checkSetupRateLimit).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires a JSON object with only supported fields", async () => {
    const unsupportedType = await POST(request(validBody, "text/plain"));
    expect(unsupportedType.status).toBe(415);

    const malformed = await POST(request("{broken"));
    expect(malformed.status).toBe(400);

    const unknownField = await POST(
      request({ ...validBody, organizationName: "unexpected" }),
    );
    expect(unknownField.status).toBe(400);
  });

  it.each([
    [
      { ...validBody, adminUsername: "a" },
      "用户名必须为 3 到 50 个字符",
    ],
    [
      { ...validBody, viewerUsername: "viewer name" },
      "用户名必须为 3 到 50 个字符",
    ],
    [
      { ...validBody, viewerUsername: "ＡＤＭＩＮ" },
      "必须使用不同用户名",
    ],
    [
      { ...validBody, adminPassword: "short" },
      "管理员密码必须为 12 到 128 个字符",
    ],
    [
      { ...validBody, viewerPassword: "short" },
      "只读用户密码必须为 12 到 128 个字符",
    ],
    [
      { ...validBody, viewerPassword: validBody.adminPassword },
      "不能使用相同密码",
    ],
  ])("validates bootstrap credentials %#", async (body, message) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ message: expect.stringContaining(message) }),
    );
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("applies setup rate limiting before password hashing", async () => {
    (checkSetupRateLimit as jest.Mock).mockResolvedValue(
      NextResponse.json(
        { error: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" },
        { status: 429 },
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("requires a configured setup token before hashing credentials", async () => {
    delete process.env.INSTANCE_SETUP_TOKEN;

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "SETUP_UNAVAILABLE" }),
    );
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("rejects an incorrect setup token before hashing credentials", async () => {
    const response = await POST(
      request({ ...validBody, setupToken: "wrong-token-value-that-is-long-enough" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "AUTH_FAILED" }),
    );
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("atomically creates both users, memberships, marker, and audit record", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      initialized: true,
      adminUsername: "admin",
      viewerUsername: "viewer",
    });
    expect(hashPassword).toHaveBeenNthCalledWith(
      1,
      validBody.adminPassword,
    );
    expect(hashPassword).toHaveBeenNthCalledWith(
      2,
      validBody.viewerPassword,
    );
    expect(tx.instanceSetup.create).toHaveBeenCalledWith({ data: { id: 1 } });
    expect(tx.user.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          username: "admin",
          password: `hashed:${validBody.adminPassword}`,
          role: "ADMIN",
        }),
      }),
    );
    expect(tx.user.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          username: "viewer",
          password: `hashed:${validBody.viewerPassword}`,
          role: "VIEWER",
        }),
      }),
    );
    expect(tx.organizationMember.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: "organization-id",
          userId: "admin-id",
          role: "OWNER",
        },
        {
          organizationId: "organization-id",
          userId: "viewer-id",
          role: "MEMBER",
        },
      ],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-id",
        entityType: "user",
        changes: expect.not.objectContaining({
          adminPassword: expect.anything(),
          viewerPassword: expect.anything(),
        }),
      }),
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      setupToken,
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("creates a default organization when migrations did not create one", async () => {
    tx.organization.findFirst.mockResolvedValueOnce(null);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(tx.organization.create).toHaveBeenCalledWith({
      data: { name: "默认组织" },
      select: { id: true, archived: true },
    });
  });

  it("reactivates the oldest organization before assigning initial users", async () => {
    tx.organization.findFirst.mockResolvedValueOnce({
      id: "archived-organization",
      archived: true,
    });
    tx.organization.update.mockResolvedValueOnce({
      id: "archived-organization",
      archived: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "archived-organization" },
      data: { archived: false },
      select: { id: true, archived: true },
    });
  });

  it("maps a simultaneous singleton insert race to an initialized conflict", async () => {
    (mockPrisma.$transaction as jest.Mock).mockRejectedValue(
      Object.assign(new Error("unique marker"), { code: "P2002" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "ALREADY_INITIALIZED" }),
    );
  });

  it("maps an in-transaction existing user to an initialized conflict", async () => {
    tx.user.findFirst.mockResolvedValueOnce({ id: "winner" });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(tx.instanceSetup.create).not.toHaveBeenCalled();
  });

  it("returns an internal error for unexpected bootstrap failures", async () => {
    (mockPrisma.$transaction as jest.Mock).mockRejectedValue(
      new Error("unexpected"),
    );
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "INTERNAL_ERROR" }),
    );
    consoleSpy.mockRestore();
  });
});
