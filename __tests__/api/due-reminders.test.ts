import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/due-reminders/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  },
}));

describe("due reminder cron", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  const request = (secret = "test-cron-secret") =>
    new NextRequest("http://localhost/api/cron/due-reminders", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });

  it("rejects an invalid scheduler secret", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(prisma.caseResult.findMany).not.toHaveBeenCalled();
  });

  it("creates preference-aware reminders with stable dedupe keys", async () => {
    const dueDate = new Date(Date.now() - 60_000);
    (prisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      {
        id: "c1",
        projectId: "p1",
        assigneeId: "u1",
        dueDate,
        assigneeUser: {
          notificationPreference: {
            dueSoonEnabled: true,
            overdueEnabled: true,
            dueSoonHours: 48,
          },
        },
      },
    ]);
    (prisma.notification.createMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    expect(await (await POST(request())).json()).toEqual({
      processed: 1,
      created: 1,
    });
    expect(await (await POST(request())).json()).toEqual({
      processed: 1,
      created: 0,
    });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: "OVERDUE",
          dedupeKey: `due:OVERDUE:c1:u1:${dueDate.getTime()}`,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
