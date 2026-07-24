import { PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { GET as getProjects } from "@/app/api/projects/route";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { generateToken } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    project: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    testStage: { count: jest.fn() },
    batchScope: { count: jest.fn() },
    caseResult: { count: jest.fn(), groupBy: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function authCookie(): string {
  const token = generateToken({ userId: "user_1", username: "admin" });
  return `run_insight_token=${token}`;
}

describe("Archive API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should archive a project", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    (mockPrisma.project.update as jest.Mock).mockResolvedValue({
      id: "p1",
      name: "Proj",
      archived: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest(new URL("http://localhost/api/projects/p1"), {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json", cookie: authCookie() },
    });
    const res = await patchProject(req, { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();
    expect(body.archived).toBe(true);
  });

  it("should exclude archived projects by default", async () => {
    (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const req = new NextRequest(new URL("http://localhost/api/projects"));
    req.headers.set("cookie", authCookie());
    await getProjects(req);

    const findManyCall = (mockPrisma.project.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.archived).toBe(false);
  });

  it("should include archived projects when includeArchived=true", async () => {
    (mockPrisma.project.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const req = new NextRequest(new URL("http://localhost/api/projects?includeArchived=true"));
    req.headers.set("cookie", authCookie());
    await getProjects(req);

    const findManyCall = (mockPrisma.project.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.archived).toBeUndefined();
  });
});