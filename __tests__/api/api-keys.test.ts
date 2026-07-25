import { GET, POST } from "@/app/api/projects/[id]/api-keys/route";
import { DELETE } from "@/app/api/projects/[id]/api-keys/[keyId]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { NextResponse } from "next/server";
import { NextResponse } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    apiKey: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    project: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({
  authenticateRequest: jest.fn(),
  requireRole: jest.requireActual("@/lib/auth").requireRole,
}));

describe("API Key management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticateRequest as jest.Mock).mockReturnValue({ userId: "u1", username: "admin" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: "p1" });
  });

  it("should create API key and return raw key", async () => {
    (prisma.apiKey.create as jest.Mock).mockResolvedValue({ id: "k1", description: "CI key", createdAt: new Date() });

    const req = {
      url: "http://localhost/api/projects/p1/api-keys",
      headers: new Headers(),
      json: async () => ({ description: "CI key" }),
    } as unknown as Request;
    const res = await POST(req as any, { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(body.key).toBeDefined();
    expect(body.key).toHaveLength(64);
    expect(body.description).toBe("CI key");
  });

  it("should list keys without raw key", async () => {
    (prisma.apiKey.findMany as jest.Mock).mockResolvedValue([
      { id: "k1", description: "CI key", createdAt: new Date() },
    ]);

    const req = { url: "http://localhost/api/projects/p1/api-keys", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any, { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(body.keys[0]).not.toHaveProperty("key");
    expect(body.keys[0].description).toBe("CI key");
  });

  it("should delete API key", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue({ id: "k1" });
    (prisma.apiKey.delete as jest.Mock).mockResolvedValue({});

    const req = { url: "http://localhost/api/projects/p1/api-keys/k1", headers: new Headers() } as unknown as Request;
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "p1", keyId: "k1" }) });
    expect(res.status).toBe(200);
  });

  it("should return 403 for non-admin users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });

    const req = { url: "http://localhost/api/projects/p1/api-keys", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(403);
  });

  it("should return 500 when listing keys fails", async () => {
    (prisma.apiKey.findMany as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = { url: "http://localhost/api/projects/p1/api-keys", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(500);
  });

  it("should return 404 when project does not exist on POST", async () => {
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

    const req = {
      url: "http://localhost/api/projects/p1/api-keys",
      headers: new Headers(),
      json: async () => ({ description: "CI key" }),
    } as unknown as Request;
    const res = await POST(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(404);
  });

  it("should return 500 when creating API key fails", async () => {
    (prisma.apiKey.create as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = {
      url: "http://localhost/api/projects/p1/api-keys",
      headers: new Headers(),
      json: async () => ({ description: "CI key" }),
    } as unknown as Request;
    const res = await POST(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(500);
  });

  it("should return 404 when deleting non-existent API key", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue(null);

    const req = { url: "http://localhost/api/projects/p1/api-keys/k1", headers: new Headers() } as unknown as Request;
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "p1", keyId: "k1" }) });
    expect(res.status).toBe(404);
  });

  it("should return 500 when deleting API key fails", async () => {
    (prisma.apiKey.findFirst as jest.Mock).mockResolvedValue({ id: "k1" });
    (prisma.apiKey.delete as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = { url: "http://localhost/api/projects/p1/api-keys/k1", headers: new Headers() } as unknown as Request;
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "p1", keyId: "k1" }) });
    expect(res.status).toBe(500);
  });

  it("should return 401 when not authenticated", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = { url: "http://localhost/api/projects/p1/api-keys", headers: new Headers() } as unknown as Request;
    const res = await GET(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("should return 401 when creating API key without auth", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = {
      url: "http://localhost/api/projects/p1/api-keys",
      headers: new Headers(),
      json: async () => ({ description: "CI key" }),
    } as unknown as Request;
    const res = await POST(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("should return 401 when deleting API key without auth", async () => {
    (authenticateRequest as jest.Mock).mockReturnValue(
      NextResponse.json({ error: "UNAUTHORIZED", message: "未登录" }, { status: 401 })
    );

    const req = { url: "http://localhost/api/projects/p1/api-keys/k1", headers: new Headers() } as unknown as Request;
    const res = await DELETE(req as any, { params: Promise.resolve({ id: "p1", keyId: "k1" }) });
    expect(res.status).toBe(401);
  });

  it("should create API key with empty description fallback", async () => {
    (prisma.apiKey.create as jest.Mock).mockResolvedValue({ id: "k2", description: "", createdAt: new Date() });

    const req = {
      url: "http://localhost/api/projects/p1/api-keys",
      headers: new Headers(),
      json: async () => ({ description: "" }),
    } as unknown as Request;
    const res = await POST(req as any, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(201);
  });
});