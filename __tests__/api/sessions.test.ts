import {
  DELETE as revokeOthers,
  GET,
} from "@/app/api/auth/sessions/route";
import { DELETE as revokeOne } from "@/app/api/auth/sessions/[id]/route";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  createLogoutCookie: jest.requireActual("@/lib/auth").createLogoutCookie,
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/audit", () => ({ writeAuditLog: jest.fn() }));

const request = new NextRequest("http://localhost/api/auth/sessions");
const sessionContext = { params: Promise.resolve({ id: "session-2" }) };
const now = new Date("2026-07-27T00:00:00.000Z");

function record(
  overrides: Partial<{
    id: string;
    deviceInfo: string;
    expiresAt: Date;
    revokedAt: Date | null;
    lastSeenAt: Date;
    createdAt: Date;
  }> = {},
) {
  return {
    id: "session-1",
    deviceInfo: "Chrome · macOS",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    revokedAt: null,
    lastSeenAt: now,
    createdAt: now,
    ...overrides,
  };
}

describe("current user session API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "user-1",
      username: "admin",
      sessionId: "session-1",
    });
  });

  it("lists only the authenticated user's safe session metadata", async () => {
    (prisma.session.findMany as jest.Mock).mockResolvedValue([
      record(),
      record({
        id: "session-2",
        deviceInfo: "Firefox · Windows",
        revokedAt: new Date("2026-07-26T00:00:00.000Z"),
      }),
    ]);

    const response = await GET(request);
    const body = await response.json();

    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" }, take: 30 }),
    );
    expect(body.sessions[0]).toEqual(
      expect.objectContaining({
        deviceInfo: "Chrome · macOS",
        status: "ACTIVE",
        isCurrent: true,
      }),
    );
    expect(body.sessions[0]).not.toHaveProperty("token");
    expect(body.sessions[0]).not.toHaveProperty("ip");
    expect(body.sessions[0]).not.toHaveProperty("userAgent");
    expect(body.sessions[1].status).toBe("REVOKED");
  });

  it("revokes other sessions while preserving the current one", async () => {
    (prisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const response = await revokeOthers(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked: 2 });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        revokedAt: null,
        NOT: { id: "session-1" },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokes one owned session", async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: "session-2",
      revokedAt: null,
    });
    (prisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const response = await revokeOne(request, sessionContext);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked: true, current: false });
    expect(prisma.session.findFirst).toHaveBeenCalledWith({
      where: { id: "session-2", userId: "user-1" },
      select: { id: true, revokedAt: true },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: "session-2", userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("does not allow access to another user's session", async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await revokeOne(request, sessionContext);

    expect(response.status).toBe(404);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("clears the cookie when the current session is revoked", async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValue({
      id: "session-1",
      revokedAt: null,
    });
    (prisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const currentContext = {
      params: Promise.resolve({ id: "session-1" }),
    };

    const response = await revokeOne(request, currentContext);

    expect((await response.json()).current).toBe(true);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns authentication failures without querying sessions", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue(
      NextResponse.json(
        { error: "UNAUTHORIZED", message: "未登录" },
        { status: 401 },
      ),
    );

    expect((await GET(request)).status).toBe(401);
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });
});
