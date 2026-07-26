import { NextRequest } from "next/server";
import {
  DELETE,
  GET,
  POST,
} from "@/app/api/cases/[id]/watch/route";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/project-access", () => ({ getProjectAccess: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    caseResult: { findUnique: jest.fn() },
    caseWatcher: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const caseId = "clxxxxxxxxxxxxxxxxxxxxxx1";
const context = { params: Promise.resolve({ id: caseId }) };
const request = (method = "GET") =>
  new NextRequest(`http://localhost/api/cases/${caseId}/watch`, { method });

describe("case watch API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "u1",
      username: "alice",
    });
    (prisma.caseResult.findUnique as jest.Mock).mockResolvedValue({
      id: caseId,
      projectId: "p1",
    });
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: true });
  });

  it("creates and removes only the current user's watcher", async () => {
    (prisma.caseWatcher.upsert as jest.Mock).mockResolvedValue({});
    (prisma.caseWatcher.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    expect((await POST(request("POST"), context)).status).toBe(201);
    expect(prisma.caseWatcher.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: "u1", caseResultId: caseId },
      }),
    );
    expect((await DELETE(request("DELETE"), context)).status).toBe(200);
    expect(prisma.caseWatcher.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", caseResultId: caseId },
    });
  });

  it("returns the current user's watch state", async () => {
    (prisma.caseWatcher.findUnique as jest.Mock).mockResolvedValue({ id: "w1" });
    const response = await GET(request(), context);
    expect(await response.json()).toEqual({ watching: true });
  });

  it("blocks users without project access", async () => {
    (getProjectAccess as jest.Mock).mockResolvedValue({ canView: false });
    expect((await POST(request("POST"), context)).status).toBe(403);
    expect(prisma.caseWatcher.upsert).not.toHaveBeenCalled();
  });
});
