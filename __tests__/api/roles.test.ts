import { PATCH as patchCases } from "@/app/api/cases/route";
import { DELETE as deleteProject } from "@/app/api/projects/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    caseResult: { updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    caseActivity: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    project: { delete: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.requireActual("@/lib/auth").requireRole,
}));

describe("Role-based access control", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reject VIEWER from PATCH cases", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "viewer" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });

    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({ organizationId: "o1" });
    (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "MEMBER" });
    (prisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      { id: "claaaaaaaaaaaaaaaaaaaaaa1", projectId: "p1" },
    ]);

    const req = { url: "http://localhost/api/cases", headers: new Headers(), json: async () => ({ caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"], updates: { assignee: "test" } }) } as unknown as Request;
    const res = await patchCases(req as any);
    expect(res.status).toBe(403);
  });

  it("should allow EDITOR to PATCH cases", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "editor" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({ organizationId: "o1" });
    (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "MEMBER" });
    (prisma.caseResult.findMany as jest.Mock).mockResolvedValue([
      {
        id: "claaaaaaaaaaaaaaaaaaaaaa1",
        projectId: "p1",
        assignee: null,
      },
    ]);
    (prisma.caseResult.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const req = { url: "http://localhost/api/cases", headers: new Headers(), json: async () => ({ caseIds: ["claaaaaaaaaaaaaaaaaaaaaa1"], updates: { assignee: "test" } }) } as unknown as Request;
    const res = await patchCases(req as any);
    expect(res.status).toBe(200);
  });

  it("should reject EDITOR from DELETE project", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "editor" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      organizationId: "o1",
      name: "Project",
      archived: false,
    });
    (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "MEMBER" });

    const req = { url: "http://localhost/api/projects/p1", headers: new Headers() } as unknown as Request;
    const res = await deleteProject(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(403);
  });

  it("should allow ADMIN to move a project to the recycle bin", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      organizationId: "o1",
      name: "Project",
      archived: false,
    });
    (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: "OWNER" });
    (prisma.project.update as jest.Mock).mockResolvedValue({ id: "p1" });

    const req = { url: "http://localhost/api/projects/p1", headers: new Headers() } as unknown as Request;
    const res = await deleteProject(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
  });
});
