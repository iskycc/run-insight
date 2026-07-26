import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: jest.fn() },
  },
}));

describe("writeAuditLog", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should call prisma.auditLog.create with correct params", async () => {
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

    const written = await writeAuditLog({
      userId: "u1",
      action: "UPDATE",
      entityType: "case",
      entityId: "c1",
      changes: { assignee: "test" },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        action: "UPDATE",
        entityType: "case",
        entityId: "c1",
        changes: { assignee: "test" },
      },
    });
    expect(written).toBe(true);
  });

  it("redacts credentials and tokens at every nesting level", async () => {
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

    await writeAuditLog({
      userId: "u1",
      action: "LOGIN",
      entityType: "session",
      entityId: "u1",
      changes: {
        authentication: "password",
        password: "plain-text",
        nested: {
          token: "jwt-value",
          passwordChanged: true,
        },
      },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: {
          authentication: "password",
          password: "[REDACTED]",
          nested: {
            token: "[REDACTED]",
            passwordChanged: true,
          },
        },
      }),
    });
  });

  it("does not throw and emits safe structured context on prisma error", async () => {
    const databaseError = Object.assign(new Error("contains mysql://secret"), {
      code: "P2024",
    });
    (prisma.auditLog.create as jest.Mock).mockRejectedValue(databaseError);

    await expect(writeAuditLog({
      userId: "u1",
      action: "UPDATE",
      entityType: "case",
      entityId: "c1",
      changes: { token: "must-not-be-logged" },
    })).resolves.toBe(false);

    const record = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(record).toEqual(
      expect.objectContaining({
        level: "error",
        event: "audit.write_failed",
        requestId: expect.any(String),
        context: {
          action: "UPDATE",
          entityType: "case",
          entityId: "c1",
          userId: "u1",
        },
        error: expect.objectContaining({
          name: "Error",
          code: "P2024",
          message: "Audit log write failed",
        }),
      }),
    );
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain("must-not-be-logged");
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain("mysql://secret");
  });
});
