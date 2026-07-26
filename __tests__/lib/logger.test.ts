import {
  isValidRequestId,
  logger,
  resolveRequestId,
} from "@/lib/logger";

describe("structured logger", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  });

  it("emits JSON with stable fields and recursively redacts secrets", () => {
    const circular: Record<string, unknown> = {
      nested: {
        api_token: "token-value",
        profile: { password: "password-value", visible: true },
      },
    };
    circular.self = circular;

    logger.error("test.failure", {
      requestId: "req-safe.123",
      context: circular,
      error: Object.assign(new Error("raw database://secret"), {
        code: "P2024",
      }),
      safeErrorMessage: "Controlled failure",
    });

    const record = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(record).toEqual(
      expect.objectContaining({
        timestamp: expect.any(String),
        level: "error",
        event: "test.failure",
        requestId: "req-safe.123",
        context: {
          nested: {
            api_token: "[REDACTED]",
            profile: { password: "[REDACTED]", visible: true },
          },
          self: "[CIRCULAR]",
        },
        error: expect.objectContaining({
          name: "Error",
          code: "P2024",
          message: "Controlled failure",
        }),
      }),
    );
    expect(JSON.stringify(record)).not.toContain("token-value");
    expect(JSON.stringify(record)).not.toContain("password-value");
    expect(JSON.stringify(record)).not.toContain("database://secret");
  });

  it("omits stack traces in production", () => {
    Object.assign(process.env, { NODE_ENV: "production" });

    logger.error("test.production_failure", {
      error: new Error("private message"),
      safeErrorMessage: "Safe message",
    });

    const record = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(record.error).toEqual({
      name: "Error",
      message: "Safe message",
    });
    expect(JSON.stringify(record)).not.toContain("private message");
  });

  it("accepts only bounded safe request IDs", () => {
    expect(isValidRequestId("req_01.example:abc")).toBe(true);
    expect(isValidRequestId("bad id")).toBe(false);
    expect(isValidRequestId("x".repeat(129))).toBe(false);
    expect(resolveRequestId("x".repeat(129))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
  });
});
