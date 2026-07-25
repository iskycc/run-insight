import { authenticateApiKey } from "@/lib/auth";
import crypto from "crypto";

describe("authenticateApiKey", () => {
  it("should return null when no x-api-key header", async () => {
    const mockPrisma = { apiKey: { findFirst: jest.fn() } };
    const req = { headers: new Headers() } as any;
    const result = await authenticateApiKey(req, mockPrisma as any);
    expect(result).toBeNull();
  });

  it("should return projectId and userId when key is valid", async () => {
    const rawKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const mockPrisma = {
      apiKey: { findFirst: jest.fn().mockResolvedValue({ projectId: "p1", userId: "u1" }) },
    };
    const headers = new Headers();
    headers.set("x-api-key", rawKey);
    const req = { headers } as any;

    const result = await authenticateApiKey(req, mockPrisma as any);
    expect(result).toEqual({ projectId: "p1", userId: "u1" });
    expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({ where: { keyHash } });
  });

  it("should return null when key is invalid", async () => {
    const mockPrisma = {
      apiKey: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const headers = new Headers();
    headers.set("x-api-key", "invalid-key");
    const req = { headers } as any;

    const result = await authenticateApiKey(req, mockPrisma as any);
    expect(result).toBeNull();
  });

  it("should return null when key has no associated user", async () => {
    const rawKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const mockPrisma = {
      apiKey: { findFirst: jest.fn().mockResolvedValue({ projectId: "p1", userId: null }) },
    };
    const headers = new Headers();
    headers.set("x-api-key", rawKey);
    const req = { headers } as any;

    const result = await authenticateApiKey(req, mockPrisma as any);
    expect(result).toBeNull();
    expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({ where: { keyHash } });
  });
});