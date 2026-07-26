import { NextRequest } from "next/server";
import { PATCH, DELETE } from "@/app/api/organizations/[id]/members/[memberId]/route";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMember: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const db = prisma as jest.Mocked<typeof prisma>;
const params = { params: Promise.resolve({ id: "o1", memberId: "m1" }) };

describe("organization owner invariants", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "u1",
      username: "owner",
    });
    (db.organizationMember.findUnique as jest.Mock).mockResolvedValue({
      role: "OWNER",
    });
  });

  it("prevents demoting the last owner in a serializable transaction", async () => {
    (db.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback({
        organizationMember: {
          findFirst: jest.fn().mockResolvedValue({
            id: "m1",
            organizationId: "o1",
            userId: "u1",
            role: "OWNER",
          }),
          count: jest.fn().mockResolvedValue(1),
        },
      }),
    );
    const request = new NextRequest("http://localhost/api/organizations/o1/members/m1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ADMIN" }),
    });
    const response = await PATCH(request, params);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "CONFLICT",
      message: "组织必须保留至少一名所有者",
    });
  });

  it("prevents an admin from deleting an owner", async () => {
    (db.organizationMember.findUnique as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    (db.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback({
        organizationMember: {
          findFirst: jest.fn().mockResolvedValue({
            id: "m1",
            organizationId: "o1",
            userId: "u2",
            role: "OWNER",
          }),
        },
      }),
    );
    const response = await DELETE(
      new NextRequest("http://localhost/api/organizations/o1/members/m1", {
        method: "DELETE",
      }),
      params,
    );
    expect(response.status).toBe(403);
  });
});
