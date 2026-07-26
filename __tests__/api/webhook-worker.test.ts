import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    webhookDelivery: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));
jest.mock("@/lib/webhooks", () => ({
  decryptWebhookSecret: jest.fn().mockReturnValue("whsec_test"),
  sendSignedWebhook: jest.fn(),
  webhookRetryDelayMs: jest.fn().mockReturnValue(120_000),
}));

import { POST } from "@/app/api/cron/webhooks/process/route";
import { prisma } from "@/lib/prisma";
import {
  decryptWebhookSecret,
  sendSignedWebhook,
  webhookRetryDelayMs,
} from "@/lib/webhooks";

const updateMany = prisma.webhookDelivery.updateMany as jest.Mock;
const findFirst = prisma.webhookDelivery.findFirst as jest.Mock;
const send = sendSignedWebhook as jest.Mock;

function request(secret = "cron-secret") {
  return new NextRequest("http://localhost/api/cron/webhooks/process", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "x-request-id": "worker-request-1",
    },
  });
}

const candidate = {
  id: "delivery-1",
  status: "PENDING",
  attempts: 1,
};
const delivery = {
  id: "delivery-1",
  endpointId: "endpoint-1",
  projectId: "project-1",
  targetUrl: "https://hooks.example.com/receive",
  payload: {
    id: "event-1",
    type: "IMPORT_COMPLETED",
    timestamp: "2026-07-27T00:00:00.000Z",
    projectId: "project-1",
    data: {},
  },
  status: "PROCESSING",
  attempts: 2,
  maxAttempts: 6,
  endpoint: {
    active: true,
    deletedAt: null,
    secretCiphertext: "encrypted",
  },
};

describe("webhook delivery worker", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    findFirst.mockResolvedValueOnce(candidate).mockResolvedValueOnce(delivery);
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("rejects callers without the shared cron secret", async () => {
    const response = await POST(request("wrong"));
    expect(response.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("claims one due delivery and marks a successful response", async () => {
    send.mockResolvedValue({
      ok: true,
      responseStatus: 204,
      responseBody: "",
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: true,
      status: "SUCCEEDED",
      terminal: false,
      nextAttemptAt: null,
    });
    expect(decryptWebhookSecret).toHaveBeenCalledWith("encrypted");
    expect(send).toHaveBeenCalledWith({
      url: delivery.targetUrl,
      secret: "whsec_test",
      envelope: delivery.payload,
    });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "delivery-1",
        claimToken: expect.any(String),
        status: "PROCESSING",
      },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        responseStatus: 204,
        errorCode: null,
        deliveredAt: expect.any(Date),
      }),
    });
  });

  it("schedules a bounded exponential retry after failure", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
    send.mockResolvedValue({
      ok: false,
      responseStatus: 503,
      responseBody: "unavailable",
      errorCode: "HTTP_ERROR",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(body).toEqual(
      expect.objectContaining({
        processed: true,
        status: "FAILED",
        terminal: false,
        nextAttemptAt: expect.any(String),
      }),
    );
    expect(webhookRetryDelayMs).toHaveBeenCalledWith(2);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          nextAttemptAt: expect.any(Date),
          responseStatus: 503,
          errorCode: "HTTP_ERROR",
        }),
      }),
    );
    const log = JSON.parse(consoleWarn.mock.calls[0][0]);
    expect(log).toEqual(
      expect.objectContaining({
        event: "webhook.delivery_failed",
        requestId: "worker-request-1",
      }),
    );
    expect(JSON.stringify(log)).not.toContain("unavailable");
    consoleWarn.mockRestore();
  });

  it("stops retrying after the configured maximum", async () => {
    findFirst
      .mockReset()
      .mockResolvedValueOnce({ ...candidate, attempts: 5 })
      .mockResolvedValueOnce({ ...delivery, attempts: 6 });
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
    send.mockResolvedValue({ ok: false, errorCode: "TIMEOUT" });

    const response = await POST(request());
    expect(await response.json()).toEqual({
      processed: true,
      status: "FAILED",
      terminal: true,
      nextAttemptAt: null,
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          nextAttemptAt: null,
          errorCode: "TIMEOUT",
        }),
      }),
    );
    consoleWarn.mockRestore();
  });
});
