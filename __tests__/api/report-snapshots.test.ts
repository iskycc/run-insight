import { GET } from "@/app/api/report-snapshots/[id]/route";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/project-access", () => ({ getProjectAccess: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    reportSnapshot: { findUnique: jest.fn() },
    reportNotification: { updateMany: jest.fn() },
  },
}));

const request = new NextRequest("http://localhost/api/report-snapshots/snapshot_1");
const context = { params: Promise.resolve({ id: "snapshot_1" }) };

describe("report snapshot access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.reportSnapshot.findUnique as jest.Mock).mockResolvedValue({
      id: "snapshot_1",
      projectId: "project_1",
      project: { id: "project_1", name: "Demo" },
      scheduledReport: {
        id: "report_1",
        ownerId: "owner_1",
        cadence: "DAILY",
        timezone: "Asia/Shanghai",
      },
    });
  });

  it("does not provide anonymous snapshot sharing", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "未登录" },
        { status: 401 },
      ),
    );
    expect((await GET(request, context)).status).toBe(401);
    expect(prisma.reportSnapshot.findUnique).not.toHaveBeenCalled();
  });

  it("forbids a logged-in user without current project access", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "outsider",
      username: "mallory",
    });
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: false });
    const response = await GET(request, context);
    expect(response.status).toBe(403);
    expect(prisma.reportNotification.updateMany).not.toHaveBeenCalled();
  });
});
