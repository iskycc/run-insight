import { GET, PATCH } from "@/app/api/cases/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), options as RequestInit);
}

function authCookie(): string {
  const token = generateToken({ userId: "user_1", username: "admin" });
  return `run_insight_token=${token}`;
}

const sampleCase = {
  id: "clxxxxxxxxxxxxxxxxxxxxxx1",
  caseNo: "TC-001",
  name: "测试用例1",
  resultSummary: "FAIL",
  logUrl: null,
  projectId: "p1",
  testStageId: "s1",
  batchScopeId: "b1",
  assignee: null,
  progressCategory: null,
  rootCause: null,
  mrOrTicket: null,
  assetSaved: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("GET /api/cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth", async () => {
    const req = createRequest("/api/cases");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should return cases with pagination", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([sampleCase]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(1);

    const req = createRequest("/api/cases");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.cases).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  it("should filter by projectId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?projectId=p1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.projectId).toBe("p1");
  });

  it("should filter by testStageId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?testStageId=s1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.testStageId).toBe("s1");
  });

  it("should filter by batchScopeId", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?batchScopeId=b1");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.batchScopeId).toBe("b1");
  });

  it("should filter by progressCategory", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?progressCategory=LOCATED");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.progressCategory).toBe("LOCATED");
  });

  it("should filter by assetSaved", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?assetSaved=true");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.assetSaved).toBe(true);
  });

  it("should respect page and pageSize params", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.count as jest.Mock).mockResolvedValue(0);

    const req = createRequest("/api/cases?page=2&pageSize=10");
    req.headers.set("cookie", authCookie());
    await GET(req);

    const findManyCall = (mockPrisma.caseResult.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.skip).toBe(10);
    expect(findManyCall.take).toBe(10);
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/cases");
    req.headers.set("cookie", authCookie());
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 without auth", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"], updates: { assignee: "张三" } }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 if caseIds is missing", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ updates: { assignee: "张三" } }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("should return 400 if caseIds is empty", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ caseIds: [], updates: { assignee: "张三" } }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("should return 400 if updates is empty", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"], updates: {} }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("should batch update cases successfully", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1", "claaaaaaaaaaaaaaaaaaaaaa2"],
        updates: { assignee: "张三", progressCategory: "LOCATED" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.updated).toBe(2);
  });

  it("should batch update with partial fields (some undefined)", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { assignee: "李四" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    // Verify only assignee is in the data, other fields are not
    const updateCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.assignee).toBe("李四");
    expect(updateCall.data.progressCategory).toBeUndefined();
    expect(updateCall.data.rootCause).toBeUndefined();
    expect(updateCall.data.mrOrTicket).toBeUndefined();
    expect(updateCall.data.assetSaved).toBeUndefined();
  });

  it("should return 500 on database error", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({ caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"], updates: { assignee: "张三" } }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });

  it("should batch update with only some update fields", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { rootCause: "代码缺陷", assetSaved: true },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const updateManyCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.data.rootCause).toBe("代码缺陷");
    expect(updateManyCall.data.assetSaved).toBe(true);
    expect(updateManyCall.data.assignee).toBeUndefined();
    expect(updateManyCall.data.progressCategory).toBeUndefined();
    expect(updateManyCall.data.mrOrTicket).toBeUndefined();
  });

  it("should batch update with only assignee field", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { assignee: "李四" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const updateManyCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.data.assignee).toBe("李四");
    expect(Object.keys(updateManyCall.data)).toHaveLength(1);
  });

  it("should batch update with mrOrTicket field", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { mrOrTicket: "MR-789" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const updateManyCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.data.mrOrTicket).toBe("MR-789");
  });

  it("should batch update with assetSaved field", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { assetSaved: true },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const updateManyCall = (mockPrisma.caseResult.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.data.assetSaved).toBe(true);
  });

  it("should return 400 if caseId is not a valid CUID", async () => {
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["invalid-id"],
        updates: { assignee: "张三" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("should return 400 if progressCategory is invalid", async () => {
    (mockPrisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { progressCategory: "INVALID_CATEGORY" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("进展分类不合法");
  });

  it("should return 400 if rootCause exceeds maxLength", async () => {
    const longRootCause = "a".repeat(201);
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { rootCause: longRootCause },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("should return 400 if mrOrTicket exceeds maxLength", async () => {
    const longMr = "m".repeat(201);
    const req = createRequest("/api/cases", {
      method: "PATCH",
      body: JSON.stringify({
        caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"],
        updates: { mrOrTicket: longMr },
      }),
      headers: { "Content-Type": "application/json" },
    });
    req.headers.set("cookie", authCookie());
    const res = await PATCH(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});
