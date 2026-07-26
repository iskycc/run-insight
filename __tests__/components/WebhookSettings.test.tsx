/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WebhookSettings } from "@/components/projects/WebhookSettings";
import { ToastProvider } from "@/contexts/ToastContext";

const originalFetch = globalThis.fetch;

function response(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("WebhookSettings", () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn().mockImplementation(
      (url: string, init?: RequestInit) => {
        if (url.endsWith("/webhooks") && init?.method === "POST") {
          return response(
            {
              webhook: {
                id: "webhook-1",
                projectId: "project-1",
                url: "https://hooks.example.com/receive",
                active: true,
                events: ["IMPORT_COMPLETED"],
                secretPrefix: "whsec_abc",
                createdAt: "2026-07-27T00:00:00.000Z",
                updatedAt: "2026-07-27T00:00:00.000Z",
              },
              secret: "whsec_raw-secret-shown-once",
            },
            201,
          );
        }
        if (url.endsWith("/webhooks")) return response({ webhooks: [] });
        return response({}, 404);
      },
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("creates an HTTPS webhook and displays its secret once", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <WebhookSettings
          projectId="project-1"
          canAdmin
          archived={false}
        />
      </ToastProvider>,
    );

    const createButtons = await screen.findAllByRole("button", {
      name: "创建 Webhook",
    });
    await user.click(createButtons[0]);
    await user.type(
      screen.getByRole("textbox", { name: "HTTPS URL" }),
      "https://hooks.example.com/receive",
    );
    await user.click(screen.getByLabelText("导入失败"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("Webhook 签名密钥"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("issued-webhook-secret")).toHaveTextContent(
      "whsec_raw-secret-shown-once",
    );
    const createCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url, init]: [string, RequestInit | undefined]) =>
        url.endsWith("/webhooks") && init?.method === "POST",
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      url: "https://hooks.example.com/receive",
      active: true,
      events: ["IMPORT_COMPLETED"],
    });
  });

  it("shows no management controls to non-admin users", () => {
    render(
      <ToastProvider>
        <WebhookSettings
          projectId="project-1"
          canAdmin={false}
          archived={false}
        />
      </ToastProvider>,
    );
    expect(
      screen.getByText("Webhook 管理仅对项目管理员开放"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "创建 Webhook" }),
    ).not.toBeInTheDocument();
  });
});
