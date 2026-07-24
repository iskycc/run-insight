import { GET, POST } from "@/app/api/projects/[id]/api-keys/route";
import { DELETE } from "@/app/api/projects/[id]/api-keys/[keyId]/route";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

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
});