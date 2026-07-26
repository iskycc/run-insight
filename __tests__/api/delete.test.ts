import { DELETE as deleteProject } from "@/app/api/projects/[id]/route";
import { DELETE as deleteStage } from "@/app/api/stages/[id]/route";
import { DELETE as deleteBatch } from "@/app/api/batches/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    project: { delete: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    testStage: { delete: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    batchScope: { delete: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.fn().mockResolvedValue(null),
}));

describe("DELETE APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      organizationId: undefined,
    });
  });

  it("should move a project to trash by default", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      name: "Project",
      archived: false,
    });
    (prisma.project.update as jest.Mock).mockResolvedValue({ id: "p1" });

    const req = { url: "http://localhost/api/projects/p1", headers: new Headers() } as unknown as Request;
    const res = await deleteProject(req as never, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(body.permanent).toBe(false);
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { archived: true },
    });
    expect(prisma.project.delete).not.toHaveBeenCalled();
  });

  it("should return 404 for non-existent project", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    const req = { url: "http://localhost/api/projects/p1", headers: new Headers() } as unknown as Request;
    const res = await deleteProject(req as never, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(404);
  });

  it("should move a stage to trash by default", async () => {
    (prisma.testStage.findUnique as jest.Mock).mockResolvedValue({
      id: "s1",
      name: "Stage",
      projectId: "p1",
      archived: false,
    });
    (prisma.testStage.update as jest.Mock).mockResolvedValue({ id: "s1" });

    const req = { url: "http://localhost/api/stages/s1", headers: new Headers() } as unknown as Request;
    const res = await deleteStage(req as never, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    expect(prisma.testStage.delete).not.toHaveBeenCalled();
  });

  it("should move a batch to trash by default", async () => {
    (prisma.batchScope.findUnique as jest.Mock).mockResolvedValue({
      id: "b1",
      name: "Batch",
      projectId: "p1",
      testStageId: "s1",
      archived: false,
    });
    (prisma.batchScope.update as jest.Mock).mockResolvedValue({ id: "b1" });

    const req = { url: "http://localhost/api/batches/b1", headers: new Headers() } as unknown as Request;
    const res = await deleteBatch(req as never, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(200);
    expect(prisma.batchScope.delete).not.toHaveBeenCalled();
  });
});
