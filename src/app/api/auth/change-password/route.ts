import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  createLogoutCookie,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

function validateNewPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return jsonError("VALIDATION_ERROR", "当前密码和新密码为必填");
    }

    const { currentPassword, newPassword } = body as Record<string, unknown>;
    if (typeof currentPassword !== "string" || !currentPassword) {
      return jsonError("VALIDATION_ERROR", "当前密码为必填");
    }
    if (!validateNewPassword(newPassword)) {
      return jsonError("VALIDATION_ERROR", "新密码长度必须为 8 到 128 个字符");
    }
    if (currentPassword === newPassword) {
      return jsonError("VALIDATION_ERROR", "新密码不能与当前密码相同");
    }

    const user = await prisma.user.findUnique({
      where: { id: authResult.userId },
      select: { id: true, password: true },
    });
    if (!user) {
      return jsonError("NOT_FOUND", "用户不存在", 404);
    }

    const passwordMatches = await verifyPassword(currentPassword, user.password);
    if (!passwordMatches) {
      return jsonError("AUTH_FAILED", "当前密码错误", 401);
    }

    const password = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await writeAuditLog({
      userId: user.id,
      action: "PASSWORD_CHANGE",
      entityType: "user",
      entityId: user.id,
      changes: { passwordChanged: true },
    });

    const response = NextResponse.json({ success: true });
    response.headers.set("set-cookie", createLogoutCookie());
    return response;
  } catch {
    return internalError("修改密码失败");
  }
}
