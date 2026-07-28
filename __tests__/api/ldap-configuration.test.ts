import { NextRequest, NextResponse } from "next/server";
import {
  GET,
  PUT,
} from "@/app/api/admin/ldap/route";
import { POST as testConnection } from "@/app/api/admin/ldap/test/route";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  LdapUnavailableError,
  getLdapConfiguration,
  saveLdapConfiguration,
  testLdapConfiguration,
} from "@/lib/ldap";

jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/ldap", () => {
  const actual = jest.requireActual("@/lib/ldap");
  return {
    ...actual,
    getLdapConfiguration: jest.fn(),
    saveLdapConfiguration: jest.fn(),
    testLdapConfiguration: jest.fn(),
  };
});

const configuration = {
  enabled: true,
  url: "ldaps://ldap.example.com:636",
  bindDn: "cn=service,dc=example,dc=com",
  passwordConfigured: true,
  searchBase: "ou=people,dc=example,dc=com",
  userFilter: "(uid={{username}})",
  uniqueIdAttribute: "entryUUID",
  startTls: true,
  tlsRejectUnauthorized: true,
  tlsCaCertificate: "",
  connectTimeoutMs: 5000,
  operationTimeoutMs: 5000,
  allowInsecure: false,
  updatedAt: "2026-07-28T01:00:00.000Z",
};

const updateRequest = {
  enabled: true,
  url: configuration.url,
  bindDn: configuration.bindDn,
  bindPassword: "service-password",
  searchBase: configuration.searchBase,
  userFilter: configuration.userFilter,
  uniqueIdAttribute: configuration.uniqueIdAttribute,
  startTls: configuration.startTls,
  tlsRejectUnauthorized: configuration.tlsRejectUnauthorized,
  tlsCaCertificate: configuration.tlsCaCertificate,
  connectTimeoutMs: configuration.connectTimeoutMs,
  operationTimeoutMs: configuration.operationTimeoutMs,
  allowInsecure: configuration.allowInsecure,
};

function request(
  method: string,
  body?: Record<string, unknown>,
) {
  return new NextRequest("http://localhost/api/admin/ldap", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("LDAP configuration API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      username: "admin",
    });
    (requireRole as jest.Mock).mockResolvedValue(null);
    (getLdapConfiguration as jest.Mock).mockResolvedValue(configuration);
    (saveLdapConfiguration as jest.Mock).mockResolvedValue(configuration);
    (testLdapConfiguration as jest.Mock).mockResolvedValue(true);
  });

  it("requires authentication and administrator access", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValueOnce(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "未登录" },
        { status: 401 },
      ),
    );
    expect((await GET(request("GET"))).status).toBe(401);

    (authenticateRequest as jest.Mock).mockResolvedValueOnce({
      userId: "viewer-1",
      username: "viewer",
    });
    (requireRole as jest.Mock).mockResolvedValueOnce(
      NextResponse.json(
        { error: "FORBIDDEN", message: "权限不足" },
        { status: 403 },
      ),
    );
    expect((await GET(request("GET"))).status).toBe(403);
  });

  it("returns only public configuration fields", async () => {
    const response = await GET(request("GET"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(configuration);
    expect(JSON.stringify(body)).not.toContain("service-password");
    expect(body).not.toHaveProperty("encryptionKey");
    expect(body).not.toHaveProperty("bindPasswordCiphertext");
  });

  it("validates and saves configuration without auditing credentials", async () => {
    const response = await PUT(request("PUT", updateRequest));

    expect(response.status).toBe(200);
    expect(saveLdapConfiguration).toHaveBeenCalledWith({
      ...updateRequest,
      tlsCaCertificate: undefined,
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        action: "UPDATE",
        entityType: "ldapConfiguration",
        changes: expect.objectContaining({
          enabled: true,
          bindCredentialUpdated: true,
        }),
      }),
    );
    expect(JSON.stringify((writeAuditLog as jest.Mock).mock.calls)).not.toContain(
      "service-password",
    );
  });

  it("rejects malformed and insecure configuration", async () => {
    const response = await PUT(
      request("PUT", {
        ...updateRequest,
        url: "ldap://ldap.example.com:389",
        startTls: false,
      }),
    );

    expect(response.status).toBe(400);
    expect(saveLdapConfiguration).not.toHaveBeenCalled();
  });

  it("tests the current form with ephemeral user credentials", async () => {
    const response = await testConnection(
      request("POST", {
        configuration: updateRequest,
        testUsername: "alice",
        testPassword: "user-password",
      }),
    );

    expect(response.status).toBe(200);
    expect(testLdapConfiguration).toHaveBeenCalledWith(
      {
        ...updateRequest,
        tlsCaCertificate: undefined,
      },
      "alice",
      "user-password",
    );
    expect(JSON.stringify((writeAuditLog as jest.Mock).mock.calls)).not.toContain(
      "user-password",
    );
  });

  it("reports rejected user credentials and directory outages safely", async () => {
    (testLdapConfiguration as jest.Mock).mockResolvedValueOnce(false);
    const rejected = await testConnection(
      request("POST", {
        configuration: updateRequest,
        testUsername: "alice",
        testPassword: "wrong-password",
      }),
    );
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).message).not.toContain("wrong-password");

    (testLdapConfiguration as jest.Mock).mockRejectedValueOnce(
      new LdapUnavailableError(new Error("service bind rejected")),
    );
    const unavailable = await testConnection(
      request("POST", {
        configuration: updateRequest,
        testUsername: "alice",
        testPassword: "user-password",
      }),
    );
    expect(unavailable.status).toBe(502);
    expect((await unavailable.json()).message).not.toContain("service bind rejected");
  });
});
