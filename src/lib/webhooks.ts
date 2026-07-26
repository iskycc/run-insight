import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { Prisma, WebhookEvent } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type {
  WebhookDeliveryDTO,
  WebhookEndpointDTO,
  WebhookEventType,
} from "@/types";

export const WEBHOOK_EVENTS = [
  "IMPORT_COMPLETED",
  "IMPORT_FAILED",
  "QUALITY_GATE_FAILED",
  "REPORT_GENERATED",
] as const satisfies readonly WebhookEvent[];

export const WEBHOOK_MAX_ATTEMPTS = 6;
export const WEBHOOK_TIMEOUT_MS = 5_000;
export const WEBHOOK_MAX_REQUEST_BYTES = 256 * 1024;
export const WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024;

const WEBHOOK_EVENT_SET = new Set<string>(WEBHOOK_EVENTS);

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookEnvelope {
  id: string;
  type: WebhookEventName;
  timestamp: string;
  projectId: string;
  data: Record<string, unknown>;
}

export class WebhookConfigurationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WebhookConfigurationError";
  }
}

export interface WebhookSendResult {
  ok: boolean;
  responseStatus?: number;
  responseBody?: string;
  errorCode?: string;
}

type Resolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export interface PinnedWebhookRequest {
  target: URL;
  address: string;
  family: number;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

type WebhookTransport = (
  request: PinnedWebhookRequest,
) => Promise<{ status: number; body: string }>;

function encryptionKey(): Buffer {
  const configured = process.env.WEBHOOK_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new WebhookConfigurationError(
      "WEBHOOK_ENCRYPTION_KEY_MISSING",
      "Webhook 加密密钥尚未配置",
    );
  }
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new WebhookConfigurationError(
      "WEBHOOK_ENCRYPTION_KEY_INVALID",
      "Webhook 加密密钥格式无效",
    );
  }
  return key;
}

export function createWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function encryptWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptWebhookSecret(ciphertext: string): string {
  const [version, ivValue, tagValue, encryptedValue, extra] =
    ciphertext.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !encryptedValue ||
    extra
  ) {
    throw new WebhookConfigurationError(
      "WEBHOOK_SECRET_INVALID",
      "Webhook 密钥数据无效",
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new WebhookConfigurationError(
      "WEBHOOK_SECRET_INVALID",
      "Webhook 密钥数据无效",
    );
  }
}

export function parseWebhookEvents(value: unknown):
  | { ok: true; value: WebhookEventName[] }
  | { ok: false; message: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, message: "至少选择一个 Webhook 事件" };
  }
  const events = Array.from(
    new Set(value.filter((item): item is string => typeof item === "string")),
  );
  if (
    events.length !== value.length ||
    events.some((event) => !WEBHOOK_EVENT_SET.has(event))
  ) {
    return { ok: false, message: "Webhook 事件不合法" };
  }
  return { ok: true, value: events as WebhookEventName[] };
}

export function parseWebhookUrl(value: unknown):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  if (typeof value !== "string" || value.length > 2048) {
    return { ok: false, message: "Webhook URL 不合法" };
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return {
        ok: false,
        message: "Webhook URL 必须为不含凭据的 HTTPS 地址",
      };
    }
    if (
      url.hostname.toLowerCase() === "localhost" ||
      url.hostname.endsWith(".localhost")
    ) {
      return { ok: false, message: "Webhook URL 不能指向本地地址" };
    }
    if (isIP(url.hostname) && !isPublicWebhookAddress(url.hostname)) {
      return { ok: false, message: "Webhook URL 不能指向私有网络" };
    }
    url.hash = "";
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, message: "Webhook URL 不合法" };
  }
}

function ipv4Number(address: string): number | null {
  if (isIP(address) !== 4) return null;
  return address
    .split(".")
    .reduce((result, octet) => (result << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Range(address: number, base: string, prefix: number): boolean {
  const baseNumber = ipv4Number(base);
  if (baseNumber === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (baseNumber & mask);
}

function ipv6Bytes(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  const [leftValue, rightValue = ""] = address.toLowerCase().split("::");
  if (address.split("::").length > 2) return null;
  const parseSide = (value: string): number[] | null => {
    if (!value) return [];
    const parts = value.split(":");
    const result: number[] = [];
    for (const part of parts) {
      if (part.includes(".")) {
        const mapped = ipv4Number(part);
        if (mapped === null) return null;
        result.push((mapped >>> 16) & 0xffff, mapped & 0xffff);
      } else if (/^[0-9a-f]{1,4}$/.test(part)) {
        result.push(Number.parseInt(part, 16));
      } else {
        return null;
      }
    }
    return result;
  };
  const left = parseSide(leftValue);
  const right = parseSide(rightValue);
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (!address.includes("::") && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill(0), ...right];
  if (groups.length !== 8) return null;
  return groups.flatMap((group) => [group >>> 8, group & 0xff]);
}

export function isPublicWebhookAddress(address: string): boolean {
  const ipv4Mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (ipv4Mapped) return isPublicWebhookAddress(ipv4Mapped);

  const ipv4 = ipv4Number(address);
  if (ipv4 !== null) {
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ];
    return !blocked.some(([base, prefix]) =>
      inIpv4Range(ipv4, base, prefix),
    );
  }

  const bytes = ipv6Bytes(address);
  if (!bytes) return false;
  if (bytes.every((byte) => byte === 0)) return false;
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return false;
  }
  if (
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  ) {
    return isPublicWebhookAddress(bytes.slice(12).join("."));
  }
  if ((bytes[0] & 0xfe) === 0xfc) return false;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false;
  if (bytes[0] === 0xff) return false;
  return true;
}

async function defaultResolver(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}

export async function assertPublicWebhookTarget(
  urlValue: string,
  resolver: Resolver = defaultResolver,
): Promise<{ url: URL; address: string; family: number }> {
  const parsed = parseWebhookUrl(urlValue);
  if (!parsed.ok) {
    throw new WebhookConfigurationError("INVALID_URL", parsed.message);
  }
  const url = new URL(parsed.value);
  const addresses = await resolver(url.hostname);
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicWebhookAddress(address))
  ) {
    throw new WebhookConfigurationError(
      "SSRF_BLOCKED",
      "Webhook 目标解析到了禁止访问的网络地址",
    );
  }
  return { url, address: addresses[0].address, family: addresses[0].family };
}

async function pinnedHttpsTransport(
  input: PinnedWebhookRequest,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const port = input.target.port ? Number(input.target.port) : 443;
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: input.address,
        family: input.family,
        port,
        method: "POST",
        path: `${input.target.pathname}${input.target.search}`,
        servername: input.target.hostname,
        headers: {
          ...input.headers,
          host: input.target.host,
          "content-length": String(Buffer.byteLength(input.body)),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          length += buffer.length;
          if (length > WEBHOOK_MAX_RESPONSE_BYTES) {
            response.destroy(
              new WebhookConfigurationError(
                "RESPONSE_TOO_LARGE",
                "Webhook 响应超过大小限制",
              ),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 2048),
          });
        });
        response.on("error", reject);
      },
    );
    const abort = () => {
      const error = new Error("Webhook request aborted");
      error.name = "AbortError";
      request.destroy(error);
    };
    if (input.signal.aborted) {
      abort();
      return;
    }
    input.signal.addEventListener("abort", abort, { once: true });
    request.on("error", reject);
    request.on("close", () => {
      input.signal.removeEventListener("abort", abort);
    });
    request.end(input.body);
  });
}

export async function sendSignedWebhook(
  input: {
    url: string;
    secret: string;
    envelope: WebhookEnvelope;
  },
  dependencies: {
    resolver?: Resolver;
    transport?: WebhookTransport;
    now?: () => Date;
  } = {},
): Promise<WebhookSendResult> {
  const body = JSON.stringify(input.envelope);
  if (Buffer.byteLength(body) > WEBHOOK_MAX_REQUEST_BYTES) {
    return { ok: false, errorCode: "PAYLOAD_TOO_LARGE" };
  }

  try {
    const resolved = await assertPublicWebhookTarget(
      input.url,
      dependencies.resolver,
    );
    const timestamp = Math.floor(
      (dependencies.now?.() ?? new Date()).getTime() / 1000,
    ).toString();
    const signature = createHmac("sha256", input.secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      WEBHOOK_TIMEOUT_MS,
    );
    try {
      const response = await (dependencies.transport ?? pinnedHttpsTransport)({
        target: resolved.url,
        address: resolved.address,
        family: resolved.family,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "user-agent": "Run-Insight-Webhook/1.0",
          "webhook-id": input.envelope.id,
          "webhook-timestamp": timestamp,
          "webhook-signature": `sha256=${signature}`,
        },
        body,
      });
      if (response.status >= 300 && response.status < 400) {
        return {
          ok: false,
          responseStatus: response.status,
          errorCode: "REDIRECT_NOT_ALLOWED",
        };
      }
      if (Buffer.byteLength(response.body) > WEBHOOK_MAX_RESPONSE_BYTES) {
        return { ok: false, errorCode: "RESPONSE_TOO_LARGE" };
      }
      const responseBody = response.body;
      return response.status >= 200 && response.status < 300
        ? { ok: true, responseStatus: response.status, responseBody }
        : {
            ok: false,
            responseStatus: response.status,
            responseBody,
            errorCode: "HTTP_ERROR",
          };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const code =
      error instanceof WebhookConfigurationError
        ? error.code
        : error instanceof Error && error.name === "AbortError"
          ? "TIMEOUT"
          : "NETWORK_ERROR";
    return { ok: false, errorCode: code };
  }
}

function endpointAcceptsEvent(events: unknown, event: WebhookEventName) {
  return Array.isArray(events) && events.includes(event);
}

export async function emitWebhookEvent(input: {
  projectId: string;
  event: WebhookEventName;
  data: Record<string, unknown>;
}): Promise<number> {
  const eventId = randomUUID();
  const timestamp = new Date();
  try {
    const endpointClient = prisma.webhookEndpoint;
    const deliveryClient = prisma.webhookDelivery;
    // Older test doubles and partially migrated deployments may not expose the
    // queue models yet. Event emission is deliberately best-effort.
    if (!endpointClient?.findMany || !deliveryClient?.createMany) return 0;
    const endpoints = await endpointClient.findMany({
      where: {
        projectId: input.projectId,
        active: true,
        deletedAt: null,
      },
      select: { id: true, url: true, events: true },
    });
    const matching = endpoints.filter((endpoint) =>
      endpointAcceptsEvent(endpoint.events, input.event),
    );
    if (matching.length === 0) return 0;

    const envelope: WebhookEnvelope = {
      id: eventId,
      type: input.event,
      timestamp: timestamp.toISOString(),
      projectId: input.projectId,
      data: input.data,
    };
    const result = await deliveryClient.createMany({
      data: matching.map((endpoint) => ({
        endpointId: endpoint.id,
        projectId: input.projectId,
        eventId,
        event: input.event,
        targetUrl: endpoint.url,
        payload: envelope as unknown as Prisma.InputJsonValue,
        nextAttemptAt: timestamp,
        maxAttempts: WEBHOOK_MAX_ATTEMPTS,
      })),
    });
    return result.count;
  } catch (error) {
    logger.error("webhook.enqueue_failed", {
      context: { projectId: input.projectId, event: input.event },
      error,
      safeErrorMessage: "Webhook event enqueue failed",
    });
    return 0;
  }
}

export function webhookRetryDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, attempts - 1));
}

export function serializeWebhookEndpoint(endpoint: {
  id: string;
  projectId: string;
  url: string;
  active: boolean;
  events: unknown;
  secretPrefix: string;
  createdAt: Date;
  updatedAt: Date;
}): WebhookEndpointDTO {
  const parsedEvents = parseWebhookEvents(endpoint.events);
  return {
    id: endpoint.id,
    projectId: endpoint.projectId,
    url: endpoint.url,
    active: endpoint.active,
    events: parsedEvents.ok
      ? (parsedEvents.value as WebhookEventType[])
      : [],
    secretPrefix: endpoint.secretPrefix,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

export function serializeWebhookDelivery(delivery: {
  id: string;
  eventId: string;
  event: WebhookEvent;
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WebhookDeliveryDTO {
  return {
    id: delivery.id,
    eventId: delivery.eventId,
    event: delivery.event,
    status: delivery.status,
    attempts: delivery.attempts,
    maxAttempts: delivery.maxAttempts,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    responseStatus: delivery.responseStatus,
    responseBody: delivery.responseBody,
    errorCode: delivery.errorCode,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}
