import { requireRole } from "@/lib/auth";

describe("requireRole", () => {
  it("should return null when user has required role", async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    };
    const result = await requireRole("u1", ["ADMIN"], mockPrisma as any);
    expect(result).toBeNull();
  });

  it("should return 403 when user has insufficient role", async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "VIEWER" }) },
    };
    const result = await requireRole("u1", ["ADMIN", "EDITOR"], mockPrisma as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("should return 403 when user not found", async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const result = await requireRole("u1", ["ADMIN"], mockPrisma as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});