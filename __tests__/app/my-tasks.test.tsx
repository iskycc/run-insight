/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyTasksPage from "@/app/my-tasks/page";

const mockFetchJson = jest.fn();

jest.mock("@/lib/fetch", () => {
  const actual = jest.requireActual("@/lib/fetch");
  return {
    ...actual,
    fetchJson: (...args: unknown[]) => mockFetchJson(...args),
  };
});

jest.mock("@/components/shared/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "alice", role: "EDITOR" },
    isLoading: false,
  }),
}));

jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn(), hideToast: jest.fn(), toasts: [] }),
}));

const task = {
  id: "c1",
  caseNo: "TC-001",
  name: "支付失败",
  resultSummary: "FAIL",
  logUrl: null,
  projectId: "p1",
  testStageId: "s1",
  batchScopeId: "b1",
  assignee: "alice",
  assigneeId: "u1",
  assigneeUsername: "alice",
  priority: "HIGH",
  dueDate: "2026-07-31T00:00:00.000Z",
  progressCategory: "ANALYZING",
  rootCause: null,
  mrOrTicket: null,
  notes: null,
  assetSaved: false,
  updatedBy: null,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
  project: { id: "p1", name: "支付系统" },
  stage: { id: "s1", name: "SIT" },
  batchScope: { id: "b1", name: "Batch 1" },
};

describe("MyTasksPage", () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
    mockFetchJson
      .mockResolvedValueOnce({
        tasks: [task],
        total: 25,
        page: 1,
        pageSize: 20,
      })
      .mockResolvedValueOnce({
        tasks: [],
        total: 25,
        page: 2,
        pageSize: 20,
      });
  });

  it("loads subsequent pages of assigned tasks", async () => {
    render(<MyTasksPage />);

    await waitFor(() => {
      expect(screen.getByText("TC-001 · 支付失败")).toBeInTheDocument();
    });
    expect(screen.getByText("第 1 / 2 页")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenLastCalledWith(
        expect.stringContaining("page=2"),
      );
    });
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();
  });
});
