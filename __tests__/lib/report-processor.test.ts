import { processDueScheduledReport } from "@/lib/report-processor";
import { prisma } from "@/lib/prisma";
import { generateReportSummary } from "@/lib/scheduled-reports";
import { emitWebhookEvent } from "@/lib/webhooks";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    scheduledReport: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    reportSnapshot: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    reportNotification: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/scheduled-reports", () => ({
  createClaimToken: jest.fn(() => "claim_1"),
  generateReportSummary: jest.fn(),
  getNextRunAfterOccurrence: jest.fn(
    () => new Date("2026-07-29T01:00:00.000Z"),
  ),
  getReportPeriodKey: jest.fn(() => "2026-07-28"),
}));
jest.mock("@/lib/webhooks", () => ({
  emitWebhookEvent: jest.fn().mockResolvedValue(0),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const report = {
  id: "report_1",
  ownerId: "owner_1",
  projectId: "project_1",
  name: "日报",
  type: "TREND" as const,
  config: {},
  cadence: "DAILY" as const,
  timezone: "Asia/Shanghai",
  runHour: 9,
  runMinute: 0,
  weekDay: 1,
  nextRunAt: new Date("2026-07-28T01:00:00.000Z"),
  lastRunAt: null,
  active: true,
  claimToken: "claim_1",
  claimedAt: new Date("2026-07-28T01:00:00.000Z"),
  lastError: null,
  consecutiveFails: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  project: { archived: false },
};

describe("scheduled report processor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.scheduledReport.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    (mockPrisma.scheduledReport.findUnique as jest.Mock).mockResolvedValue(report);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
  });

  it("reuses an existing period snapshot and advances once", async () => {
    const snapshot = {
      id: "snapshot_1",
      generatedAt: new Date("2026-07-28T01:00:00.000Z"),
    };
    (generateReportSummary as jest.Mock).mockResolvedValue({ trends: [] });
    (mockPrisma.reportSnapshot.findUnique as jest.Mock).mockResolvedValue(snapshot);
    (mockPrisma.reportNotification.upsert as jest.Mock).mockResolvedValue({});

    await expect(
      processDueScheduledReport(
        "report_1",
        new Date("2026-07-28T01:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "processed", snapshotId: "snapshot_1" });
    expect(mockPrisma.reportSnapshot.create).not.toHaveBeenCalled();
    expect(mockPrisma.reportNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { snapshotId: "snapshot_1" } }),
    );
    expect(emitWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("releases the claim without advancing after generation failure", async () => {
    (generateReportSummary as jest.Mock).mockRejectedValue(new Error("db down"));

    const result = await processDueScheduledReport(
      "report_1",
      new Date("2026-07-28T01:00:00.000Z"),
    );

    expect(result).toEqual({ status: "failed", message: "db down" });
    expect(mockPrisma.scheduledReport.updateMany).toHaveBeenLastCalledWith({
      where: { id: "report_1", claimToken: "claim_1" },
      data: {
        claimToken: null,
        claimedAt: null,
        lastError: "db down",
        consecutiveFails: { increment: 1 },
      },
    });
    expect(emitWebhookEvent).not.toHaveBeenCalled();
  });
});
