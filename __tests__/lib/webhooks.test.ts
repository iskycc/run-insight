import { createHmac } from "node:crypto";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEndpoint: { findMany: jest.fn() },
    webhookDelivery: { createMany: jest.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  assertPublicWebhookTarget,
  createWebhookSecret,
  decryptWebhookSecret,
  emitWebhookEvent,
  encryptWebhookSecret,
  isPublicWebhookAddress,
  parseWebhookEvents,
  parseWebhookUrl,
  sendSignedWebhook,
  webhookRetryDelayMs,
  WEBHOOK_MAX_RESPONSE_BYTES,
} from "@/lib/webhooks";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

describe("webhook security and delivery", () => {
  const originalEncryptionKey = process.env.WEBHOOK_ENCRYPTION_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEBHOOK_ENCRYPTION_KEY = encryptionKey;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    if (originalEncryptionKey === undefined) {
      delete process.env.WEBHOOK_ENCRYPTION_KEY;
    } else {
      process.env.WEBHOOK_ENCRYPTION_KEY = originalEncryptionKey;
    }
  });

  it("encrypts generated secrets and never stores plaintext in ciphertext", () => {
    const secret = createWebhookSecret();
    const encrypted = encryptWebhookSecret(secret);

    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
  });

  it("rejects a missing encryption key and tampered ciphertext", () => {
    delete process.env.WEBHOOK_ENCRYPTION_KEY;
    expect(() => encryptWebhookSecret("whsec_test")).toThrow(
      "Webhook 加密密钥尚未配置",
    );
    process.env.WEBHOOK_ENCRYPTION_KEY = encryptionKey;
    expect(() => decryptWebhookSecret("v1.bad.bad.bad")).toThrow(
      "Webhook 密钥数据无效",
    );
  });

  it("validates URL and event allowlists", () => {
    expect(parseWebhookUrl("http://example.com/hook").ok).toBe(false);
    expect(parseWebhookUrl("https://user:pass@example.com/hook").ok).toBe(
      false,
    );
    expect(parseWebhookUrl("https://127.0.0.1/hook").ok).toBe(false);
    expect(parseWebhookUrl("https://169.254.169.254/latest").ok).toBe(false);
    expect(parseWebhookUrl("https://hooks.example.com/path#fragment")).toEqual({
      ok: true,
      value: "https://hooks.example.com/path",
    });
    expect(parseWebhookEvents([]).ok).toBe(false);
    expect(parseWebhookEvents(["IMPORT_COMPLETED", "UNKNOWN"]).ok).toBe(false);
    expect(
      parseWebhookEvents(["IMPORT_COMPLETED", "IMPORT_FAILED"]),
    ).toEqual({
      ok: true,
      value: ["IMPORT_COMPLETED", "IMPORT_FAILED"],
    });
  });

  it("blocks private, loopback, link-local, metadata and mapped addresses", () => {
    for (const address of [
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.20.1.1",
      "192.168.1.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
    ]) {
      expect(isPublicWebhookAddress(address)).toBe(false);
    }
    expect(isPublicWebhookAddress("8.8.8.8")).toBe(true);
    expect(isPublicWebhookAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("rejects a hostname if any DNS answer is private", async () => {
    await expect(
      assertPublicWebhookTarget("https://hooks.example.com/path", async () => [
        { address: "203.0.113.8", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("signs timestamp plus raw body and disables redirects", async () => {
    const envelope = {
      id: "event-1",
      type: "IMPORT_COMPLETED" as const,
      timestamp: "2026-07-27T00:00:00.000Z",
      projectId: "project-1",
      data: { imported: 3 },
    };
    const transport = jest.fn().mockResolvedValue({
      status: 202,
      body: "accepted",
    });

    const result = await sendSignedWebhook(
      {
        url: "https://hooks.example.com/receive",
        secret: "whsec_test",
        envelope,
      },
      {
        resolver: async () => [{ address: "203.0.113.8", family: 4 }],
        transport,
        now: () => new Date("2026-07-27T00:00:05.000Z"),
      },
    );

    expect(result).toEqual({
      ok: true,
      responseStatus: 202,
      responseBody: "accepted",
    });
    const transportInput = transport.mock.calls[0][0];
    const body = JSON.stringify(envelope);
    const expected = createHmac("sha256", "whsec_test")
      .update(`1785110405.${body}`)
      .digest("hex");
    expect(transportInput.target.toString()).toBe(
      "https://hooks.example.com/receive",
    );
    expect(transportInput.address).toBe("203.0.113.8");
    expect(transportInput.family).toBe(4);
    expect(transportInput.headers).toEqual(
      expect.objectContaining({
        "webhook-id": "event-1",
        "webhook-timestamp": "1785110405",
        "webhook-signature": `sha256=${expected}`,
      }),
    );
    expect(transportInput.body).toBe(body);
  });

  it("rejects redirects and oversized responses", async () => {
    const base = {
      url: "https://hooks.example.com/receive",
      secret: "whsec_test",
      envelope: {
        id: "event-1",
        type: "IMPORT_FAILED" as const,
        timestamp: "2026-07-27T00:00:00.000Z",
        projectId: "project-1",
        data: {},
      },
    };
    const resolver = async () => [{ address: "203.0.113.8", family: 4 }];

    await expect(
      sendSignedWebhook(base, {
        resolver,
        transport: jest
          .fn()
          .mockResolvedValue({ status: 302, body: "" }),
      }),
    ).resolves.toEqual({
      ok: false,
      responseStatus: 302,
      errorCode: "REDIRECT_NOT_ALLOWED",
    });

    const oversized = "x".repeat(WEBHOOK_MAX_RESPONSE_BYTES + 1);
    await expect(
      sendSignedWebhook(base, {
        resolver,
        transport: jest
          .fn()
          .mockResolvedValue({ status: 200, body: oversized }),
      }),
    ).resolves.toEqual({ ok: false, errorCode: "RESPONSE_TOO_LARGE" });
  });

  it("aborts a pinned transport that exceeds the delivery timeout", async () => {
    jest.useFakeTimers();
    const pending = sendSignedWebhook(
      {
        url: "https://hooks.example.com/receive",
        secret: "whsec_test",
        envelope: {
          id: "event-timeout",
          type: "IMPORT_FAILED",
          timestamp: "2026-07-27T00:00:00.000Z",
          projectId: "project-1",
          data: {},
        },
      },
      {
        resolver: async () => [{ address: "203.0.113.8", family: 4 }],
        transport: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      },
    );
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual({ ok: false, errorCode: "TIMEOUT" });
  });

  it("queues one immutable envelope per matching active endpoint", async () => {
    (prisma.webhookEndpoint.findMany as jest.Mock).mockResolvedValue([
      {
        id: "endpoint-1",
        url: "https://one.example/hook",
        events: ["IMPORT_COMPLETED"],
      },
      {
        id: "endpoint-2",
        url: "https://two.example/hook",
        events: ["IMPORT_FAILED"],
      },
    ]);
    (prisma.webhookDelivery.createMany as jest.Mock).mockResolvedValue({
      count: 1,
    });

    await expect(
      emitWebhookEvent({
        projectId: "project-1",
        event: "IMPORT_COMPLETED",
        data: { imported: 4 },
      }),
    ).resolves.toBe(1);

    const call = (prisma.webhookDelivery.createMany as jest.Mock).mock
      .calls[0][0];
    expect(call.data).toHaveLength(1);
    expect(call.data[0]).toEqual(
      expect.objectContaining({
        endpointId: "endpoint-1",
        projectId: "project-1",
        event: "IMPORT_COMPLETED",
        targetUrl: "https://one.example/hook",
        payload: expect.objectContaining({
          id: expect.any(String),
          type: "IMPORT_COMPLETED",
          projectId: "project-1",
          data: { imported: 4 },
        }),
      }),
    );
  });

  it("uses bounded exponential retry delays", () => {
    expect(webhookRetryDelayMs(1)).toBe(60_000);
    expect(webhookRetryDelayMs(2)).toBe(120_000);
    expect(webhookRetryDelayMs(20)).toBe(3_600_000);
  });
});
