import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hashPassword, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

function validateNewPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await params;
    if (id === authResult.userId) {
      return jsonError(
        "FORBIDDEN",
        "不能通过管理员重置接口修改自己的密码，请使用修改密码功能",
        403,
      );
    }

    const body: unknown = await request.json();
    const newPassword =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).newPassword
        : undefined;

    if (!validateNewPassword(newPassword)) {
      return jsonError("VALIDATION_ERROR", "新密码长度必须为 8 到 128 个字符");
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return jsonError("NOT_FOUND", "用户不存在", 404);
    }

    await prisma.user.update({
      where: { id },
      data: { password: await hashPassword(newPassword) },
    });
    await writeAuditLog({
      userId: authResult.userId,
      action: "UPDATE",
      entityType: "user",
      entityId: id,
      changes: { passwordReset: true },
    });

    return NextResponse.json({ success: true });
  } catch {
    return internalError("重置密码失败");
  }
}
