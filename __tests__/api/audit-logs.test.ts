import { GET } from "@/app/api/audit-logs/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    auditLog: { findMany: jest.fn(), count: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.requireActual("@/lib/auth").requireRole,
}));

describe("GET /api/audit-logs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(0);
  });

  it("should only allow ADMIN access", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    const req = { url: "http://localhost/api/audit-logs", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    expect(res.status).toBe(403);
  });

  it("should return paginated logs", async () => {
    const mockLogs = [
      { id: "l1", userId: "u1", action: "UPDATE", entityType: "case", entityId: "c1", changes: { before: {}, after: {} }, createdAt: new Date() },
    ];
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(1);

    const req = { url: "http://localhost/api/audit-logs", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});