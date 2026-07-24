import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { UpdateUserRequest, UserWithRole } from "@/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await params;
    const body: UpdateUserRequest = await request.json();
    const { role } = body;

    if (!role || !["ADMIN", "EDITOR", "VIEWER"].includes(role)) {
      return jsonError("VALIDATION_ERROR", "角色不合法");
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return jsonError("NOT_FOUND", "用户不存在", 404);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, username: true, role: true, createdAt: true, updatedAt: true },
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