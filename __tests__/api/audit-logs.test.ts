import { GET } from "@/app/api/audit-logs/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    auditLog: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.requireActual("@/lib/auth").requireRole,
}));

function request(query = ""): Request {
  return {
    url: `http://localhost/api/audit-logs${query}`,
    headers: new Headers(),
  } as unknown as Request;
}

const mockLog = {
  id: "l1",
  userId: "u1",
  action: "UPDATE",
  entityType: "case",
  entityId: "c1",
  changes: { before: {}, after: { status: "fixed" } },
  createdAt: new Date("2025-01-15T10:00:00.000Z"),
  user: { username: "admin" },
};

describe("GET /api/audit-logs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(0);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it("only allows ADMIN access", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });

    const res = await GET(request() as never);

    expect(res.status).toBe(403);
  });

  it("returns paginated logs with the username", async () => {
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([mockLog]);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(1);

    const res = await GET(request() as never);
    const body = await res.json();

    expect(body.logs).toEqual([
      expect.objectContaining({
        id: "l1",
        userId: "u1",
        username: "admin",
        createdAt: "2025-01-15T10:00:00.000Z",
      }),
    ]);
    expect(body.total).toBe(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { user: { select: { username: true } } },
      skip: 0,
      take: 20,
    }));
  });

  it("applies action, entity, user and inclusive date filters safely", async () => {
    const res = await GET(request(
      "?action=UPDATE&entityType=case&entityId=c1&userId=u_1&dateFrom=2025-01-01&dateTo=2025-01-31&page=2&pageSize=10",
    ) as never);

    expect(res.status).toBe(200);
    const expectedWhere = {
      action: "UPDATE",
      entityType: "case",
      entityId: "c1",
      userId: "u_1",
      createdAt: {
        gte: new Date("2025-01-01T00:00:00.000Z"),
        lte: new Date("2025-01-31T23:59:59.999Z"),
      },
    };
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedWhere,
      skip: 10,
      take: 10,
    }));
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it.each([
    "user",
    "member",
    "apiKey",
    "asset",
    "rootCauseCategory",
    "import",
    "export",
    "session",
    "auditLog",
  ])(
    "accepts the extended %s entity filter",
    async (entityType) => {
      const res = await GET(request(`?entityType=${entityType}`) as never);
      expect(res.status).toBe(200);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entityType } })
      );
    }
  );

  it.each([
    "LOGIN",
    "LOGOUT",
    "IMPORT",
    "EXPORT",
    "ROLLBACK",
    "REUSE",
    "ARCHIVE",
    "UNARCHIVE",
    "API_KEY_CREATE",
    "API_KEY_REVOKE",
    "PASSWORD_CHANGE",
  ])("accepts the extended %s action filter", async (action) => {
    const res = await GET(request(`?action=${action}`) as never);
    expect(res.status).toBe(200);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action } })
    );
  });

  it.each([
    ["?action=DROP", "动作筛选条件不合法"],
    ["?entityType=password", "实体类型筛选条件不合法"],
    ["?userId=%3D1%3Bdrop", "用户 ID 筛选条件不合法"],
    ["?entityId=bad%20id", "实体 ID 筛选条件不合法"],
    ["?format=xlsx", "导出格式不合法"],
    ["?dateFrom=2025-02-30", "日期格式不合法，请使用 YYYY-MM-DD"],
    ["?dateFrom=2025-02-02&dateTo=2025-02-01", "开始日期不能晚于结束日期"],
    ["?page=0", "分页参数不合法"],
    ["?page=1.5", "分页参数不合法"],
    ["?pageSize=101", "分页参数不合法"],
  ])("rejects invalid filter %s", async (query, message) => {
    const res = await GET(request(query) as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message,
    });
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("exports all filtered rows as a safe, readable CSV", async () => {
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
      { ...mockLog, user: { username: "=malicious" } },
    ]);

    const res = await GET(request("?action=UPDATE&format=csv") as never);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(text).toContain("时间");
    expect(text).toContain("\"'=malicious\"");
    expect(text).toContain("\"更新\"");
    expect(text).toContain("\"用例\"");
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { action: "UPDATE" },
      include: { user: { select: { username: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    });
    expect(prisma.auditLog.count).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        action: "EXPORT",
        entityType: "auditLog",
        entityId: "csv",
        changes: expect.objectContaining({ rowCount: 1 }),
      }),
    });
  });

  it("streams audit CSV in stable cursor batches", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      ...mockLog,
      id: `log-${index}`,
      entityId: `entity-${index}`,
    }));
    const finalLog = {
      ...mockLog,
      id: "log-final",
      entityId: "entity-final",
    };
    (prisma.auditLog.findMany as jest.Mock)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([finalLog]);

    const res = await GET(request("?format=csv") as never);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain("entity-0");
    expect(text).toContain("entity-final");
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(2);
    expect((prisma.auditLog.findMany as jest.Mock).mock.calls[1][0]).toEqual(
      expect.objectContaining({
        cursor: { id: "log-499" },
        skip: 1,
        take: 500,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({ rowCount: 501 }),
      }),
    });
  });

  it("stops audit pagination when the client cancels the stream", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      ...mockLog,
      id: `cancel-${index}`,
    }));
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(firstPage);

    const res = await GET(request("?format=csv") as never);
    const reader = res.body!.getReader();
    const firstChunk = await reader.read();
    expect(new TextDecoder().decode(firstChunk.value)).toContain("时间");

    await reader.cancel();

    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({
          rowCount: 0,
          cancelled: true,
        }),
      }),
    });
  });

  it("errors an audit stream when a later cursor query fails", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      ...mockLog,
      id: `error-${index}`,
    }));
    (prisma.auditLog.findMany as jest.Mock)
      .mockResolvedValueOnce(firstPage)
      .mockRejectedValueOnce(new Error("cursor query failed"));

    const res = await GET(request("?format=csv") as never);

    await expect(res.text()).rejects.toThrow("cursor query failed");
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns a standard error when the query fails", async () => {
    (prisma.auditLog.findMany as jest.Mock).mockRejectedValue(new Error("database error"));

    const res = await GET(request() as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "INTERNAL_ERROR",
      message: "获取审计日志失败",
    });
  });
});
