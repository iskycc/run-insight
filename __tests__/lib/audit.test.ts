import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: jest.fn() },
  },
}));

describe("writeAuditLog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call prisma.auditLog.create with correct params", async () => {
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

    await writeAuditLog({
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
  });

  it("should not throw on prisma error", async () => {
    (prisma.auditLog.create as jest.Mock).mockRejectedValue(new Error("DB error"));

    await expect(writeAuditLog({
      userId: "u1",
      action: "UPDATE",
      entityType: "case",
      entityId: "c1",
    })).resolves.not.toThrow();
  });
});