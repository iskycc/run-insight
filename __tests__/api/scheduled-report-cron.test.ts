import { POST } from "@/app/api/cron/scheduled-reports/route";
import { processDueScheduledReports } from "@/lib/report-processor";
import { NextRequest } from "next/server";

jest.mock("@/lib/report-processor", () => ({
  processDueScheduledReports: jest.fn(),
}));

describe("scheduled report cron", () => {
  const previousSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = previousSecret;
    jest.clearAllMocks();
  });

  it("rejects an invalid secret", async () => {
    process.env.CRON_SECRET = "expected";
    const response = await POST(
      new NextRequest("http://localhost/api/cron/scheduled-reports", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
    expect(processDueScheduledReports).not.toHaveBeenCalled();
  });

  it("returns processor counts to an authorized runner", async () => {
    process.env.CRON_SECRET = "expected";
    (processDueScheduledReports as jest.Mock).mockResolvedValue({
      examined: 2,
      processed: 1,
      failed: 1,
      skipped: 0,
      results: [],
    });
    const response = await POST(
      new NextRequest("http://localhost/api/cron/scheduled-reports", {
        method: "POST",
        headers: { authorization: "Bearer expected" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ processed: 1, failed: 1 }),
    );
  });
});
