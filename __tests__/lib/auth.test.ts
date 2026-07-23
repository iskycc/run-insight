import { hashPassword, verifyPassword, generateToken, verifyToken } from "@/lib/auth";

describe("auth utilities", () => {
  describe("hashPassword / verifyPassword", () => {
    it("should hash a password and verify it correctly", async () => {
      const password = "test123";
      const hashed = await hashPassword(password);
      expect(hashed).not.toBe(password);
      expect(hashed).toMatch(/^\$2[aby]\$/);
      const isValid = await verifyPassword(password, hashed);
      expect(isValid).toBe(true);
    });

    it("should reject wrong password", async () => {
      const hashed = await hashPassword("correct");
      const isValid = await verifyPassword("wrong", hashed);
      expect(isValid).toBe(false);
    });
  });

  describe("generateToken / verifyToken", () => {
    it("should generate and verify a JWT token", () => {
      const payload = { userId: "user_123", username: "admin" };
      const token = generateToken(payload);
      expect(typeof token).toBe("string");
      const decoded = verifyToken(token);
      expect(decoded.userId).toBe("user_123");
      expect(decoded.username).toBe("admin");
    });

    it("should throw on invalid token", () => {
      expect(() => verifyToken("invalid.token.here")).toThrow();
    });
  });
});
