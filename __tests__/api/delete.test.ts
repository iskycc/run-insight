import { DELETE as deleteProject } from "@/app/api/projects/[id]/route";
import { DELETE as deleteStage } from "@/app/api/stages/[id]/route";
import { DELETE as deleteBatch } from "@/app/api/batches/[id]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: { delete: jest.fn(), findUnique: jest.fn() },
    testStage: { delete: jest.fn(), findUnique: jest.fn() },
    batchScope: { delete: jest.fn(), findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
}));

describe("DELETE APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
  });

  it("should delete project", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
    (prisma.project.delete as jest.Mock).mockResolvedValue({ id: "p1" });

    const req = { url: "http://localhost/api/projects/p1", headers: new Headers() } as unknown as Request;
    const res = await deleteProject(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("should return 404 for non-existent project", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    const req = { url: "http://localhost/api/projects/p1", headers: new Headers() } as unknown as Request;
    const res = await deleteProject(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(404);
  });

  it("should delete stage", async () => {
    (prisma.testStage.findUnique as jest.Mock).mockResolvedValue({ id: "s1" });
    (prisma.testStage.delete as jest.Mock).mockResolvedValue({ id: "s1" });

    const req = { url: "http://localhost/api/stages/s1", headers: new Headers() } as unknown as Request;
    const res = await deleteStage(req as any, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
  });

  it("should delete batch", async () => {
    (prisma.batchScope.findUnique as jest.Mock).mockResolvedValue({ id: "b1" });
    (prisma.batchScope.delete as jest.Mock).mockResolvedValue({ id: "b1" });

    const req = { url: "http://localhost/api/batches/b1", headers: new Headers() } as unknown as Request;
    const res = await deleteBatch(req as any, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(200);
  });
});