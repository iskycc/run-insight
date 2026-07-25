import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole, hashPassword } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { isValidRole } from "@/lib/validations";
import type { UsersResponse, UserWithRole } from "@/types";

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json<UsersResponse>({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role as UserWithRole["role"],
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
    });
  } catch {
    return internalError("获取用户列表失败");
  }
}

export async function POST(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return jsonError("VALIDATION_ERROR", "用户名、密码和角色为必填");
    }

    const { username, password, role } = body as Record<string, unknown>;

    if (typeof username !== "string" || !username ||
        typeof password !== "string" || !password || !role) {
      return jsonError("VALIDATION_ERROR", "用户名、密码和角色为必填");
    }

    if (password.length < 8 || password.length > 128) {
      return jsonError("VALIDATION_ERROR", "密码长度必须为 8 到 128 个字符");
    }

    if (!isValidRole(role)) {
      return jsonError("VALIDATION_ERROR", "角色不合法");
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return jsonError("CONFLICT", "用户名已存在", 409);
    }

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, password: hashed, role },
      select: { id: true, username: true, role: true, createdAt: true, updatedAt: true },
    });
    await writeAuditLog({
      userId: authResult.userId,
      action: "CREATE",
      entityType: "user",
      entityId: user.id,
      changes: { username: user.username, role: user.role },
    });

    return NextResponse.json<UserWithRole>({
      id: user.id,
      username: user.username,
      role: user.role as UserWithRole["role"],
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }, { status: 201 });
  } catch {
    return internalError("创建用户失败");
  }
}
