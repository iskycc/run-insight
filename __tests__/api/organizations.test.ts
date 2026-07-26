import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/organizations/route";
import { POST as switchOrganization } from "@/app/api/organizations/current/route";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { create: jest.fn() },
    organizationMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}));

const db = prisma as jest.Mocked<typeof prisma>;

describe("organization APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "u1",
      username: "owner",
    });
  });

  it("lists only authenticated memberships and resolves current organization", async () => {
    const membership = {
      role: "OWNER",
      createdAt: new Date(),
      organization: {
        id: "o1",
        name: "默认组织",
        archived: false,
        createdAt: new Date("2026-07-27"),
      },
    };
    (db.organizationMember.findMany as jest.Mock).mockResolvedValue([membership]);
    (db.organizationMember.findFirst as jest.Mock).mockResolvedValue(membership);

    const response = await GET(new NextRequest("http://localhost/api/organizations"));
    await expect(response.json()).resolves.toMatchObject({
      currentOrganizationId: "o1",
      organizations: [{ id: "o1", role: "OWNER" }],
    });
  });

  it("creates an organization with its creator as owner and selects it", async () => {
    (db.organization.create as jest.Mock).mockResolvedValue({
      id: "o2",
      name: "研发",
      archived: false,
      createdAt: new Date("2026-07-27"),
    });
    const request = new NextRequest("http://localhost/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: " 研发 " }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain(
      "run_insight_organization=o2; HttpOnly",
    );
    expect(db.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "研发",
          members: { create: { userId: "u1", role: "OWNER" } },
        },
      }),
    );
  });

  it("does not switch to an organization without membership", async () => {
    (db.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);
    const request = new NextRequest(
      "http://localhost/api/organizations/current",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "foreign" }),
      },
    );
    const response = await switchOrganization(request);
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("passes through authentication failures", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "未登录" },
        { status: 401 },
      ),
    );
    const response = await GET(new NextRequest("http://localhost/api/organizations"));
    expect(response.status).toBe(401);
  });
});
