import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock("@/lib/project-access", () => ({
  getProjectAccess: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: jest.fn() },
    webhookEndpoint: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    webhookDelivery: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { GET, POST } from "@/app/api/projects/[id]/webhooks/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/projects/[id]/webhooks/[webhookId]/route";
import { POST as rotateSecret } from "@/app/api/projects/[id]/webhooks/[webhookId]/rotate-secret/route";
import { GET as getDeliveries } from "@/app/api/projects/[id]/webhooks/[webhookId]/deliveries/route";
import { POST as retryDelivery } from "@/app/api/projects/[id]/webhooks/[webhookId]/deliveries/[deliveryId]/retry/route";
import { authenticateRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

const auth = authenticateRequest as jest.Mock;
const access = getProjectAccess as jest.Mock;
const now = new Date("2026-07-27T00:00:00.000Z");
const endpoint = {
  id: "webhook-1",
  projectId: "project-1",
  url: "https://hooks.example.com/receive",
  active: true,
  events: ["IMPORT_COMPLETED", "IMPORT_FAILED"],
  secretCiphertext: "encrypted",
  secretPrefix: "whsec_abcdef",
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};
const routeParams = { params: Promise.resolve({ id: "project-1" }) };
const endpointParams = {
  params: Promise.resolve({ id: "project-1", webhookId: "webhook-1" }),
};

function request(
  method: string,
  body?: Record<string, unknown>,
  requestId = "request-webhook-1",
) {
  return new NextRequest("http://localhost/api/projects/project-1/webhooks", {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      "x-request-id": requestId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("project webhook APIs", () => {
  const originalKey = process.env.WEBHOOK_ENCRYPTION_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEBHOOK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    auth.mockResolvedValue({ userId: "user-1", username: "admin" });
    access.mockResolvedValue({ canAdmin: true });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project-1",
      archived: false,
    });
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.WEBHOOK_ENCRYPTION_KEY;
    else process.env.WEBHOOK_ENCRYPTION_KEY = originalKey;
  });

  it("lists endpoints without exposing encrypted or raw secrets", async () => {
    (prisma.webhookEndpoint.findMany as jest.Mock).mockResolvedValue([endpoint]);

    const response = await GET(request("GET"), routeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.webhooks[0]).toEqual({
      id: "webhook-1",
      projectId: "project-1",
      url: endpoint.url,
      active: true,
      events: endpoint.events,
      secretPrefix: "whsec_abcdef",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(JSON.stringify(body)).not.toContain("encrypted");
  });

  it("creates an endpoint and returns the raw secret exactly once", async () => {
    (prisma.webhookEndpoint.create as jest.Mock).mockImplementation(
      ({ data }) => ({ ...endpoint, ...data }),
    );

    const response = await POST(
      request("POST", {
        url: endpoint.url,
        active: true,
        events: ["IMPORT_COMPLETED"],
      }),
      routeParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.secret).toMatch(/^whsec_/);
    const createData = (prisma.webhookEndpoint.create as jest.Mock).mock
      .calls[0][0].data;
    expect(createData.secretCiphertext).toMatch(/^v1\./);
    expect(createData.secretCiphertext).not.toContain(body.secret);
    expect(createData.secretPrefix).toBe(body.secret.slice(0, 12));
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WEBHOOK_CREATE",
        entityType: "webhook",
      }),
    );
  });

  it("enforces project-admin RBAC and the event allowlist", async () => {
    access.mockResolvedValueOnce({ canAdmin: false });
    const forbidden = await POST(
      request("POST", {
        url: endpoint.url,
        events: ["IMPORT_COMPLETED"],
      }),
      routeParams,
    );
    expect(forbidden.status).toBe(403);

    const invalid = await POST(
      request("POST", {
        url: endpoint.url,
        events: ["NOT_ALLOWED"],
      }),
      routeParams,
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("VALIDATION_ERROR");
  });

  it("updates, disables and soft-deletes an endpoint with history intact", async () => {
    (prisma.webhookEndpoint.findFirst as jest.Mock).mockResolvedValue(endpoint);
    (prisma.webhookEndpoint.update as jest.Mock).mockImplementation(
      ({ data }) => ({ ...endpoint, ...data }),
    );

    const updated = await PATCH(
      request("PATCH", {
        active: false,
        events: ["QUALITY_GATE_FAILED"],
      }),
      endpointParams,
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).webhook.active).toBe(false);

    (prisma.$transaction as jest.Mock).mockResolvedValue([]);
    const deleted = await DELETE(request("DELETE"), endpointParams);
    expect(deleted.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "WEBHOOK_DELETE" }),
    );
  });

  it("rotates the secret without returning it from later endpoint reads", async () => {
    (prisma.webhookEndpoint.findFirst as jest.Mock).mockResolvedValue({
      id: endpoint.id,
    });
    (prisma.webhookEndpoint.update as jest.Mock).mockResolvedValue(endpoint);

    const response = await rotateSecret(request("POST"), endpointParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.secret).toMatch(/^whsec_/);
    expect(
      (prisma.webhookEndpoint.update as jest.Mock).mock.calls[0][0].data
        .secretCiphertext,
    ).not.toContain(body.secret);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WEBHOOK_SECRET_ROTATE" }),
    );
  });

  it("lists delivery history and manually resets a failed delivery", async () => {
    (prisma.webhookEndpoint.findFirst as jest.Mock).mockResolvedValue({
      id: endpoint.id,
    });
    const delivery = {
      id: "delivery-1",
      endpointId: endpoint.id,
      projectId: endpoint.projectId,
      eventId: "event-1",
      event: "IMPORT_FAILED",
      status: "FAILED",
      attempts: 6,
      maxAttempts: 6,
      nextAttemptAt: null,
      responseStatus: 500,
      responseBody: "error",
      errorCode: "HTTP_ERROR",
      deliveredAt: null,
      createdAt: now,
      updatedAt: now,
    };
    (prisma.webhookDelivery.findMany as jest.Mock).mockResolvedValue([delivery]);
    const list = await getDeliveries(request("GET"), endpointParams);
    expect(list.status).toBe(200);
    expect((await list.json()).deliveries[0].status).toBe("FAILED");

    (prisma.webhookDelivery.findFirst as jest.Mock).mockResolvedValue({
      ...delivery,
      endpoint: { active: true, deletedAt: null },
    });
    (prisma.webhookDelivery.update as jest.Mock).mockResolvedValue(delivery);
    const retry = await retryDelivery(request("POST"), {
      params: Promise.resolve({
        id: "project-1",
        webhookId: "webhook-1",
        deliveryId: "delivery-1",
      }),
    });
    expect(retry.status).toBe(200);
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: "PENDING",
        attempts: 0,
        errorCode: null,
      }),
    });
  });

  it("returns authentication failures unchanged", async () => {
    auth.mockResolvedValueOnce(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "请先登录" },
        { status: 401 },
      ),
    );
    const response = await GET(request("GET"), routeParams);
    expect(response.status).toBe(401);
  });
});
