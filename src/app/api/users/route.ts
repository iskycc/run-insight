import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole, hashPassword } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { UsersResponse, UserWithRole, CreateUserRequest } from "@/types";

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
    const body: CreateUserRequest = await request.json();
    const { username, password, role } = body;

    if (!username || !password || !role) {
      return jsonError("VALIDATION_ERROR", "用户名、密码和角色为必填");
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