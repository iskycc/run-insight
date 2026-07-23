import { GET as getProjects, POST as createProject } from "@/app/api/projects/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    caseResult: {
      groupBy: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(url: string, options?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), options as RequestInit);
}

function authCookie(): Record<string, string> {
  const token = generateToken({ userId: "user_1", username: "admin" });
  return { cookie: `run_insight_token=${token}` };
}

describe("GET /api/projects", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return empty list when no projects", async () => {
    (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const req = createRequest("/api/projects");
    req.headers.set("cookie", authCookie().cookie);
    const res = await getProjects(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toEqual([]);
  });

  it("should return projects with stats", async () => {
    const mockProject = {
      id: "clxxxxxxxxxxxxxxxxxxxxxx1",
      name: "测试项目",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      _count: { stages: 2, cases: 10 },
    };
    (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([mockProject]);
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([{ projectId: "clxxxxxxxxxxxxxxxxxxxxxx1", _count: { _all: 8 } }])
      .mockResolvedValueOnce([{ projectId: "clxxxxxxxxxxxxxxxxxxxxxx1", _count: { _all: 2 } }]);

    const req = createRequest("/api/projects");
    req.headers.set("cookie", authCookie().cookie);
    const res = await getProjects(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe("测试项目");
  });
});

describe("POST /api/projects", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 400 if name is missing", async () => {
    const req = createRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json", ...authCookie() },
    });
    const res = await createProject(req);
    expect(res.status).toBe(400);
  });

  it("should create a project and return it", async () => {
    const created = {
      id: "clxxxxxxxxxxxxxxxxxxxxxx2",
      name: "新项目",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    (mockPrisma.project.create as jest.Mock).mockResolvedValue(created);
    const req = createRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "新项目" }),
      headers: { "Content-Type": "application/json", ...authCookie() },
    });
    const res = await createProject(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project.name).toBe("新项目");
  });

  it("should return 409 if project name already exists", async () => {
    const error = new Error("Unique constraint failed");
    (error as Error & { code: string }).code = "P2002";
    (mockPrisma.project.create as jest.Mock).mockRejectedValue(error);
    const req = createRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "已存在" }),
      headers: { "Content-Type": "application/json", ...authCookie() },
    });
    const res = await createProject(req);
    expect(res.status).toBe(409);
  });

  it("should return 401 without auth for POST", async () => {
    const req = createRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "新项目" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await createProject(req);
    expect(res.status).toBe(401);
  });

  it("should return 500 on DB error for GET", async () => {
    (mockPrisma.project.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));
    const req = createRequest("/api/projects");
    req.headers.set("cookie", authCookie().cookie);
    const res = await getProjects(req);
    expect(res.status).toBe(500);
  });

  it("should return 500 on non-P2002 error for POST", async () => {
    (mockPrisma.project.create as jest.Mock).mockRejectedValue(new Error("Generic error"));
    const req = createRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "项目" }),
      headers: { "Content-Type": "application/json", ...authCookie() },
    });
    const res = await createProject(req);
    expect(res.status).toBe(500);
  });

  it("should return projects with zero pass/fail counts when groupBy has no entry for the project", async () => {
    const mockProject = {
      id: "clxxxxxxxxxxxxxxxxxxxxxx9",
      name: "空项目",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      _count: { stages: 0, cases: 0 },
    };
    (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([mockProject]);
    // Return groupBy results that do NOT contain this project's ID → triggers Map.get() ?? 0 fallback
    (mockPrisma.caseResult.groupBy as jest.Mock)
      .mockResolvedValueOnce([]) // passCounts: no entries for this project
      .mockResolvedValueOnce([]); // failCounts: no entries for this project

    const req = createRequest("/api/projects");
    req.headers.set("cookie", authCookie().cookie);
    const res = await getProjects(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].passCount).toBe(0);
    expect(body.projects[0].failCount).toBe(0);
  });

  it("should return 401 without auth for GET", async () => {
    const req = createRequest("/api/projects");
    const res = await getProjects(req);
    expect(res.status).toBe(401);
  });
});
