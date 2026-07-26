import { POST } from "@/app/api/scheduled-reports/route";
import { PATCH } from "@/app/api/scheduled-reports/[id]/route";
import { generateToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    scheduledReport: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function request(method: string, body: unknown) {
  const value = new NextRequest("http://localhost/api/scheduled-reports", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  value.headers.set(
    "cookie",
    `run_insight_token=${generateToken({
      userId: "user_1",
      username: "alice",
    })}`,
  );
  return value;
}

describe("scheduled report authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project_1",
      archived: false,
      organizationId: "organization_1",
    });
    (mockPrisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({
      role: "MEMBER",
    });
  });

  it("does not allow a non-member to create a schedule", async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await POST(
      request("POST", {
        name: "日报",
        projectId: "project_1",
        type: "TREND",
        config: {},
        cadence: "DAILY",
        timezone: "Asia/Shanghai",
      }),
    );
    expect(response.status).toBe(403);
    expect(mockPrisma.scheduledReport.create).not.toHaveBeenCalled();
  });

  it("hides another owner's schedule instead of modifying it", async () => {
    (mockPrisma.scheduledReport.findFirst as jest.Mock).mockResolvedValue(null);
    const response = await PATCH(
      request("PATCH", { active: false }),
      { params: Promise.resolve({ id: "report_other" }) },
    );
    expect(response.status).toBe(404);
    expect(mockPrisma.scheduledReport.findFirst).toHaveBeenCalledWith({
      where: { id: "report_other", ownerId: "user_1" },
    });
    expect(mockPrisma.scheduledReport.update).not.toHaveBeenCalled();
  });
});
