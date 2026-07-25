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

describe("JWT_SECRET production guard", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    Object.assign(process.env, { NODE_ENV: originalEnv });
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it("exits the process in production when JWT_SECRET is missing", () => {
    delete process.env.JWT_SECRET;
    Object.assign(process.env, { NODE_ENV: "production" });

    const exitSpy = jest.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@/lib/auth");
      });
    }).toThrow("process.exit(1)");

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
