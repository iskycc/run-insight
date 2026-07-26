import {
  createNotificationsBestEffort,
  extractMentionUsernames,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { createMany: jest.fn() },
    notificationPreference: { findMany: jest.fn() },
  },
}));

describe("notification delivery", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    (prisma.notificationPreference.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("extracts unique ASCII and Unicode mentions without storing comment text", () => {
    expect(
      extractMentionUsernames("@alice 请看，@张三 和 @alice 都需要确认"),
    ).toEqual(["alice", "张三"]);
  });

  it("respects per-type preferences", async () => {
    (prisma.notificationPreference.findMany as jest.Mock).mockResolvedValue([
      {
        userId: "u1",
        assignmentEnabled: true,
        mentionEnabled: false,
        watchedEnabled: true,
        dueSoonEnabled: true,
        overdueEnabled: true,
      },
    ]);

    const count = await createNotificationsBestEffort([
      {
        userId: "u1",
        actorId: "u2",
        projectId: "p1",
        caseResultId: "c1",
        type: "MENTION",
      },
    ]);

    expect(count).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("uses createMany skipDuplicates for idempotent events", async () => {
    await createNotificationsBestEffort([
      {
        userId: "u1",
        projectId: "p1",
        caseResultId: "c1",
        type: "DUE_SOON",
        dedupeKey: "due:DUE_SOON:c1:u1:1",
      },
    ]);

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: "DUE_SOON",
          dedupeKey: "due:DUE_SOON:c1:u1:1",
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("logs delivery failures without leaking provider details", async () => {
    (prisma.notificationPreference.findMany as jest.Mock).mockRejectedValue(
      Object.assign(new Error("mysql://user:secret@db"), { code: "P2024" }),
    );

    await expect(
      createNotificationsBestEffort([
        {
          userId: "u1",
          projectId: "p1",
          caseResultId: "c1",
          type: "DUE_SOON",
        },
      ]),
    ).resolves.toBe(0);

    const record = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(record).toEqual(
      expect.objectContaining({
        level: "error",
        event: "notification.delivery_failed",
        requestId: expect.any(String),
        error: expect.objectContaining({
          name: "Error",
          code: "P2024",
          message: "Notification delivery failed",
        }),
      }),
    );
    expect(JSON.stringify(record)).not.toContain("mysql://");
  });
});
