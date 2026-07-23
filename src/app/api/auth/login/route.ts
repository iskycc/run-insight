import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, generateToken, createTokenCookie } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { LoginRequest, LoginResponse, UserDTO } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return jsonError("VALIDATION_ERROR", "用户名和密码不能为空");
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      return jsonError("AUTH_FAILED", "用户名或密码错误", 401);
    }

    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return jsonError("AUTH_FAILED", "用户名或密码错误", 401);
    }

    const token = generateToken({ userId: user.id, username: user.username });
    const userDTO: UserDTO = {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
    };

    const response = NextResponse.json<LoginResponse>({ user: userDTO });
    response.headers.set("set-cookie", createTokenCookie(token));
    return response;
  } catch {
    return internalError("登录失败");
  }
}
