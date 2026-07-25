import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/tasks/my/route";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    caseResult: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockAuth = authenticateRequest as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockFindMany = prisma.caseResult.findMany as jest.Mock;
const mockCount = prisma.caseResult.count as jest.Mock;

describe("GET /api/tasks/my", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockReturnValue({ userId: "u1", username: "alice" });
    mockUserFindUnique.mockResolvedValue({ role: "EDITOR" });
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it("always scopes tasks to the authenticated assignee", async () => {
    const response = await GET(new NextRequest("http://localhost/api/tasks/my?priority=HIGH&overdue=true"));

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assigneeId: "u1",
        project: {
          members: {
            some: { userId: "u1" },
          },
        },
        priority: "HIGH",
        dueDate: { lt: expect.any(Date) },
      }),
    }));
  });

  it("rejects invalid filters", async () => {
    const response = await GET(new NextRequest("http://localhost/api/tasks/my?priority=URGENT"));
    expect(response.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("allows system administrators to see assigned tasks without a membership", async () => {
    mockUserFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await GET(new NextRequest("http://localhost/api/tasks/my"));

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { assigneeId: "u1" },
    }));
  });

  it("rejects a token whose user no longer exists", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/tasks/my"));

    expect(response.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("passes through authentication failures", async () => {
    mockAuth.mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 }),
    );

    const response = await GET(new NextRequest("http://localhost/api/tasks/my"));

    expect(response.status).toBe(401);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["status=INVALID", "任务状态不合法"],
    ["overdue=yes", "逾期筛选值不合法"],
  ])("rejects malformed filters: %s", async (query, message) => {
    const response = await GET(
      new NextRequest(`http://localhost/api/tasks/my?${query}`),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(message);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("supports status, not-overdue, and bounded pagination filters", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/tasks/my?status=LOCATED&overdue=false&page=2&pageSize=999",
    ));
    const call = mockFindMany.mock.calls[0][0];

    expect(response.status).toBe(200);
    expect(call.where.progressCategory).toBe("LOCATED");
    expect(call.where.OR).toEqual([
      { dueDate: null },
      { dueDate: { gte: expect.any(Date) } },
    ]);
    expect(call.skip).toBe(100);
    expect(call.take).toBe(100);
  });

  it("serializes task relations and pagination metadata", async () => {
    mockFindMany.mockResolvedValue([{
      id: "clxxxxxxxxxxxxxxxxxxxxxx1",
      caseNo: "TC-1",
      name: "用例",
      resultSummary: "FAIL",
      logUrl: null,
      projectId: "p1",
      testStageId: "s1",
      batchScopeId: "b1",
      assignee: "alice",
      assigneeId: "u1",
      assigneeUser: { username: "alice" },
      priority: "HIGH",
      dueDate: new Date("2026-08-01"),
      progressCategory: "LOCATED",
      rootCause: null,
      rootCauseCategoryId: null,
      mrOrTicket: null,
      notes: null,
      assetSaved: false,
      updatedBy: null,
      createdAt: new Date("2026-07-01"),
      updatedAt: new Date("2026-07-25"),
      project: { id: "p1", name: "项目" },
      stage: { id: "s1", name: "阶段" },
      batchScope: { id: "b1", name: "批次" },
    }]);
    mockCount.mockResolvedValue(1);

    const response = await GET(new NextRequest(
      "http://localhost/api/tasks/my?page=-1&pageSize=0",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      tasks: [{
        caseNo: "TC-1",
        project: { id: "p1", name: "项目" },
        stage: { id: "s1", name: "阶段" },
        batchScope: { id: "b1", name: "批次" },
      }],
    });
  });

  it("maps database failures to 500", async () => {
    mockFindMany.mockRejectedValue(new Error("DB"));

    const response = await GET(new NextRequest("http://localhost/api/tasks/my"));

    expect(response.status).toBe(500);
  });
});
