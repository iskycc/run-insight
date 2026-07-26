import { requireRole } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {},
}));

describe("requireRole", () => {
  it("should return null when user has required role", async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    };
    const result = await requireRole("u1", ["ADMIN"], mockPrisma);
    expect(result).toBeNull();
  });

  it("should return 403 when user has insufficient role", async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "VIEWER" }) },
    };
    const result = await requireRole("u1", ["ADMIN", "EDITOR"], mockPrisma);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("should return 403 when user not found", async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const result = await requireRole("u1", ["ADMIN"], mockPrisma);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});
