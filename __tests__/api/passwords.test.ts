import { NextRequest } from "next/server";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { PATCH as resetPassword } from "@/app/api/users/[id]/password/route";
import { generateToken, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function request(
  path: string,
  body: Record<string, unknown>,
  authenticated = true,
): NextRequest {
  const req = new NextRequest(new URL(path, "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  if (authenticated) {
    const token = generateToken({ userId: "user_1", username: "admin" });
    req.headers.set("cookie", `run_insight_token=${token}`);
  }
  return req;
}

describe("password management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires authentication when changing own password", async () => {
    const res = await changePassword(
      request(
        "/api/auth/change-password",
        { currentPassword: "old-password", newPassword: "new-password" },
        false,
      ),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a short new password", async () => {
    const res = await changePassword(
      request("/api/auth/change-password", {
        currentPassword: "old-password",
        newPassword: "short",
      }),
    );
    expect(res.status).toBe(400);
  });

  it.each([
    [null, "当前密码和新密码为必填"],
    [{ newPassword: "new-password" }, "当前密码为必填"],
    [{ currentPassword: "", newPassword: "new-password" }, "当前密码为必填"],
    [{ currentPassword: "old-password", newPassword: 123 }, "新密码长度必须为"],
    [{ currentPassword: "old-password", newPassword: "x".repeat(129) }, "新密码长度必须为"],
    [{ currentPassword: "same-password", newPassword: "same-password" }, "不能与当前密码相同"],
  ])("validates own-password input %#", async (body, message) => {
    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const token = generateToken({ userId: "user_1", username: "admin" });
    req.headers.set("cookie", `run_insight_token=${token}`);

    const res = await changePassword(req);

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain(message);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the authenticated user no longer exists", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await changePassword(
      request("/api/auth/change-password", {
        currentPassword: "old-password",
        newPassword: "new-password",
      }),
    );

    expect(res.status).toBe(404);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user_1",
      password: await hashPassword("correct-password"),
    });

    const res = await changePassword(
      request("/api/auth/change-password", {
        currentPassword: "wrong-password",
        newPassword: "new-password",
      }),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("changes the current user's password", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user_1",
      password: await hashPassword("old-password"),
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ id: "user_1" });

    const res = await changePassword(
      request("/api/auth/change-password", {
        currentPassword: "old-password",
        newPassword: "new-password",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { password: expect.any(String) },
    });
  });

  it("returns 500 when changing the password fails", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user_1",
      password: await hashPassword("old-password"),
    });
    (mockPrisma.user.update as jest.Mock).mockRejectedValue(new Error("DB error"));

    const res = await changePassword(
      request("/api/auth/change-password", {
        currentPassword: "old-password",
        newPassword: "new-password",
      }),
    );

    expect(res.status).toBe(500);
  });

  it("requires authentication when resetting a user's password", async () => {
    const res = await resetPassword(
      request(
        "/api/users/user_2/password",
        { newPassword: "new-password" },
        false,
      ),
      { params: Promise.resolve({ id: "user_2" }) },
    );

    expect(res.status).toBe(401);
  });

  it("requires an admin when resetting another password", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });

    const res = await resetPassword(
      request("/api/users/user_2/password", { newPassword: "new-password" }),
      { params: Promise.resolve({ id: "user_2" }) },
    );
    expect(res.status).toBe(403);
  });

  it("lets an admin reset another user's password", async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ id: "user_2" });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ id: "user_2" });

    const res = await resetPassword(
      request("/api/users/user_2/password", { newPassword: "new-password" }),
      { params: Promise.resolve({ id: "user_2" }) },
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_2" },
      data: { password: expect.any(String) },
    });
  });

  it.each([
    [null],
    [{}],
    [{ newPassword: "short" }],
    [{ newPassword: "x".repeat(129) }],
  ])("validates admin-reset input %#", async (body) => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    const req = new NextRequest("http://localhost/api/users/user_2/password", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const token = generateToken({ userId: "user_1", username: "admin" });
    req.headers.set("cookie", `run_insight_token=${token}`);

    const res = await resetPassword(req, {
      params: Promise.resolve({ id: "user_2" }),
    });

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 404 when an administrator resets a missing user", async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce(null);

    const res = await resetPassword(
      request("/api/users/user_2/password", { newPassword: "new-password" }),
      { params: Promise.resolve({ id: "user_2" }) },
    );

    expect(res.status).toBe(404);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 500 when an administrator password reset fails", async () => {
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ id: "user_2" });
    (mockPrisma.user.update as jest.Mock).mockRejectedValue(new Error("DB error"));

    const res = await resetPassword(
      request("/api/users/user_2/password", { newPassword: "new-password" }),
      { params: Promise.resolve({ id: "user_2" }) },
    );

    expect(res.status).toBe(500);
  });

  it("requires admins to use the current-password flow for themselves", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });

    const res = await resetPassword(
      request("/api/users/user_1/password", { newPassword: "new-password" }),
      { params: Promise.resolve({ id: "user_1" }) },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "FORBIDDEN",
      message: "不能通过管理员重置接口修改自己的密码，请使用修改密码功能",
    });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
