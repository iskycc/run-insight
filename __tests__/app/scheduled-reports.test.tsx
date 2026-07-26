/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import ScheduledReportsPage from "@/app/reports/scheduled/page";

const originalFetch = globalThis.fetch;

function response(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

describe("ScheduledReportsPage", () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn(
      (url: string | URL | Request) => {
        if (String(url).includes("/api/projects")) {
          return response({
            projects: [{ id: "project_1", name: "Demo", archived: false }],
          });
        }
        return response({
          reports: [
            {
              id: "report_1",
              name: "每日质量",
              type: "QUALITY_GATE",
              cadence: "DAILY",
              timezone: "Asia/Shanghai",
              runHour: 9,
              runMinute: 0,
              weekDay: 1,
              nextRunAt: "2026-07-28T01:00:00.000Z",
              lastRunAt: null,
              active: true,
              lastError: null,
              project: { id: "project_1", name: "Demo", archived: false },
              snapshots: [{ id: "snapshot_1", generatedAt: "2026-07-27T01:00:00.000Z" }],
            },
          ],
        });
      },
    );
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it("renders creation controls and schedule actions", async () => {
    render(<ScheduledReportsPage />);
    await waitFor(() => {
      expect(screen.getByText("每日质量")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "新建计划" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即运行" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "最新快照" })).toHaveAttribute(
      "href",
      "/reports/snapshots/snapshot_1",
    );
  });
});
