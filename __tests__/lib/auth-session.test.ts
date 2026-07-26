import {
  authenticateRequest,
  describeSessionDevice,
  generateToken,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function requestForToken(token: string) {
  return new NextRequest("http://localhost/api/test", {
    headers: { cookie: `run_insight_token=${token}` },
  });
}

function sessionRecord(
  overrides: Partial<{
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    lastSeenAt: Date;
  }> = {},
) {
  return {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe("session-backed authenticateRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.session.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it("keeps a pre-session JWT compatible until its own expiry", async () => {
    const token = generateToken({ userId: "user-1", username: "legacy" });

    const result = await authenticateRequest(requestForToken(token));

    expect(result).toEqual(
      expect.objectContaining({ userId: "user-1", username: "legacy" }),
    );
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a valid session-bound JWT", async () => {
    (mockPrisma.session.findUnique as jest.Mock).mockResolvedValue(
      sessionRecord(),
    );
    const token = generateToken({
      userId: "user-1",
      username: "admin",
      sessionId: "session-1",
    });

    const result = await authenticateRequest(requestForToken(token));

    expect(result).toEqual(
      expect.objectContaining({
        userId: "user-1",
        sessionId: "session-1",
      }),
    );
    expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("throttles lastSeenAt writes to one per five-minute window", async () => {
    (mockPrisma.session.findUnique as jest.Mock).mockResolvedValue(
      sessionRecord({
        lastSeenAt: new Date(Date.now() - 6 * 60 * 1000),
      }),
    );
    const token = generateToken({
      userId: "user-1",
      username: "admin",
      sessionId: "session-1",
    });

    await authenticateRequest(requestForToken(token));

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
        lastSeenAt: { lte: expect.any(Date) },
      },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it.each([
    ["missing", null],
    ["revoked", sessionRecord({ revokedAt: new Date() })],
    [
      "expired",
      sessionRecord({ expiresAt: new Date(Date.now() - 60 * 1000) }),
    ],
    ["different user", sessionRecord({ userId: "other-user" })],
  ])("rejects a %s session", async (_label, record) => {
    (mockPrisma.session.findUnique as jest.Mock).mockResolvedValue(record);
    const token = generateToken({
      userId: "user-1",
      username: "admin",
      sessionId: "session-1",
    });

    const result = await authenticateRequest(requestForToken(token));

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
    expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
  });
});

describe("describeSessionDevice", () => {
  it("stores only a normalized browser and operating-system label", () => {
    expect(
      describeSessionDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 custom-secret",
      ),
    ).toBe("Chrome · macOS");
    expect(describeSessionDevice(null)).toBe("未知设备");
  });
});
