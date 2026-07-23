import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken, getTokenFromCookies } from "@/lib/auth";
import type { MeResponse, UserDTO } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = getTokenFromCookies(cookieHeader);

    if (!token) {
      return NextResponse.json<MeResponse>({ user: null });
    }

    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return NextResponse.json<MeResponse>({ user: null });
    }

    const userDTO: UserDTO = {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
    };

    return NextResponse.json<MeResponse>({ user: userDTO });
  } catch {
    return NextResponse.json<MeResponse>({ user: null });
  }
}
