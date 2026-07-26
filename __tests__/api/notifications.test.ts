import { NextRequest } from "next/server";
import { GET as listNotifications } from "@/app/api/notifications/route";
import {
  DELETE as deleteNotification,
  PATCH as readNotification,
} from "@/app/api/notifications/[id]/route";
import {
  GET as getPreferences,
  PATCH as updatePreferences,
} from "@/app/api/notifications/preferences/route";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/project-access", () => ({ getProjectAccess: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    reportNotification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

const notificationId = "clxxxxxxxxxxxxxxxxxxxxxx1";
const context = { params: Promise.resolve({ id: notificationId }) };

describe("notification API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "u1",
      username: "alice",
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: true });
    (prisma.reportNotification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.reportNotification.count as jest.Mock).mockResolvedValue(0);
  });

  it("merges generated report notifications with snapshot links", async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);
    (prisma.reportNotification.findMany as jest.Mock).mockResolvedValue([
      {
        id: "clxxxxxxxxxxxxxxxxxxxxxx2",
        readAt: null,
        createdAt: new Date("2026-07-27T01:00:00Z"),
        link: "/reports/snapshots/snapshot_1",
        project: { id: "p1", name: "项目" },
        snapshot: { id: "snapshot_1", reportName: "每日质量" },
      },
    ]);
    (prisma.reportNotification.count as jest.Mock).mockResolvedValue(1);

    const response = await listNotifications(
      new NextRequest("http://localhost/api/notifications"),
    );
    const body = await response.json();

    expect(body.notifications[0]).toEqual(
      expect.objectContaining({
        id: "report:clxxxxxxxxxxxxxxxxxxxxxx2",
        type: "REPORT_GENERATED",
        link: "/reports/snapshots/snapshot_1",
        case: expect.objectContaining({ name: "每日质量" }),
      }),
    );
    expect(body.total).toBe(1);
  });

  it("lists only notifications in the member's accessible projects", async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([
      {
        id: notificationId,
        type: "MENTION",
        readAt: null,
        createdAt: new Date("2026-07-27T00:00:00Z"),
        actor: { id: "u2", username: "bob" },
        project: { id: "p1", name: "项目" },
        caseResult: { id: "case1", caseNo: "C-1", name: "失败用例" },
      },
    ]);
    (prisma.notification.count as jest.Mock).mockResolvedValue(1);

    const response = await listNotifications(
      new NextRequest("http://localhost/api/notifications?unread=true"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "u1",
          readAt: null,
          project: { members: { some: { userId: "u1" } } },
        },
      }),
    );
    expect(body.notifications[0]).toEqual(
      expect.objectContaining({
        link: "/case/case1",
        case: { id: "case1", caseNo: "C-1", name: "失败用例" },
      }),
    );
    expect(body.notifications[0]).not.toHaveProperty("comment");
  });

  it("does not allow reading or deleting another user's notification", async () => {
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue({
      id: notificationId,
      userId: "u2",
      projectId: "p1",
    });
    const request = new NextRequest(
      `http://localhost/api/notifications/${notificationId}`,
      { method: "PATCH" },
    );

    expect((await readNotification(request, context)).status).toBe(404);
    expect(
      (
        await deleteNotification(
          new NextRequest(request.url, { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.notification.delete).not.toHaveBeenCalled();
  });

  it("requires current project access before marking an owned notification", async () => {
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue({
      id: notificationId,
      userId: "u1",
      projectId: "p1",
    });
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: false });

    const response = await readNotification(
      new NextRequest(`http://localhost/api/notifications/${notificationId}`, {
        method: "PATCH",
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it("returns defaults and validates preference ranges", async () => {
    (prisma.notificationPreference.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    const getResponse = await getPreferences(
      new NextRequest("http://localhost/api/notifications/preferences"),
    );
    expect((await getResponse.json()).preferences.dueSoonHours).toBe(48);

    const patchResponse = await updatePreferences(
      new NextRequest("http://localhost/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueSoonHours: 0 }),
      }),
    );
    expect(patchResponse.status).toBe(400);
    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });
});
