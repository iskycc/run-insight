import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { isValidRole } from "@/lib/validations";
import type { UserWithRole } from "@/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const role = body && typeof body === "object"
      ? (body as Record<string, unknown>).role
      : undefined;

    if (!isValidRole(role)) {
      return jsonError("VALIDATION_ERROR", "角色不合法");
    }

    if (id === authResult.userId) {
      return jsonError("FORBIDDEN", "不能修改自己的角色", 403);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) {
        return { status: "not-found" as const };
      }

      if (existing.role === "ADMIN" && role !== "ADMIN") {
        const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
        if (adminCount <= 1) {
          return { status: "last-admin" as const };
        }
      }

      const user = await tx.user.update({
        where: { id },
        data: { role },
        select: { id: true, username: true, role: true, createdAt: true, updatedAt: true },
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { status: "updated" as const, user };
    }, { isolationLevel: "Serializable" });

    if (result.status === "not-found") {
      return jsonError("NOT_FOUND", "用户不存在", 404);
    }
    if (result.status === "last-admin") {
      return jsonError("FORBIDDEN", "系统至少需要保留一个管理员", 403);
    }

    const { user: updated } = result;
    await writeAuditLog({
      userId: authResult.userId,
      action: "UPDATE",
      entityType: "user",
      entityId: id,
      changes: { role: updated.role },
    });

    return NextResponse.json<UserWithRole>({
      id: updated.id,
      username: updated.username,
      role: updated.role as UserWithRole["role"],
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch {
    return internalError("更新用户失败");
  }
}
