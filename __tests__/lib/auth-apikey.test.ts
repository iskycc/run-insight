import { authenticateApiKey } from "@/lib/auth";
import { NextRequest } from "next/server";
import crypto from "crypto";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

function requestWithKey(rawKey?: string) {
  return new NextRequest("http://localhost/api/import", {
    headers: rawKey ? { "x-api-key": rawKey } : undefined,
  });
}

function record(
  overrides: Partial<{
    id: string;
    projectId: string;
    userId: string | null;
    scopes: unknown;
    expiresAt: Date | null;
    revokedAt: Date | null;
    project: { archived: boolean };
  }> = {},
) {
  return {
    id: "key-1",
    projectId: "p1",
    userId: "u1",
    scopes: ["IMPORT"],
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    revokedAt: null,
    project: { archived: false },
    ...overrides,
  };
}

function mockClient(value: ReturnType<typeof record> | null, updateCount = 1) {
  return {
    apiKey: {
      findUnique: jest.fn().mockResolvedValue(value),
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
    },
  };
}

describe("authenticateApiKey", () => {
  it("returns null without an x-api-key header", async () => {
    const client = mockClient(null);
    const result = await authenticateApiKey(
      requestWithKey(),
      client,
      "IMPORT",
    );
    expect(result).toBeNull();
    expect(client.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("authenticates a valid scoped key and safely records last use", async () => {
    const rawKey = "ri_valid-key";
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const client = mockClient(record());

    const result = await authenticateApiKey(
      requestWithKey(rawKey),
      client,
      "IMPORT",
    );

    expect(result).toEqual({ projectId: "p1", userId: "u1" });
    expect(client.apiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash },
      include: { project: { select: { archived: true } } },
    });
    expect(client.apiKey.updateMany).toHaveBeenCalledWith({
      where: {
        id: "key-1",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it.each([
    ["unknown", null],
    ["no user", record({ userId: null })],
    ["revoked", record({ revokedAt: new Date() })],
    ["expired", record({ expiresAt: new Date("2020-01-01T00:00:00.000Z") })],
    ["missing scope", record({ scopes: [] })],
    ["invalid scopes", record({ scopes: ["EXPORT"] })],
    ["archived project", record({ project: { archived: true } })],
  ])("rejects a %s key", async (_label, value) => {
    const client = mockClient(value);
    const result = await authenticateApiKey(
      requestWithKey("invalid"),
      client,
      "IMPORT",
    );
    expect(result).toBeNull();
    expect(client.apiKey.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a key revoked or expired concurrently", async () => {
    const client = mockClient(record(), 0);
    const result = await authenticateApiKey(
      requestWithKey("race"),
      client,
      "IMPORT",
    );
    expect(result).toBeNull();
  });
});
