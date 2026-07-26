import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { MeResponse, UserDTO } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request);
    if (payload instanceof NextResponse) {
      return NextResponse.json<MeResponse>({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return NextResponse.json<MeResponse>({ user: null });
    }

    const userDTO: UserDTO = {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };

    return NextResponse.json<MeResponse>({ user: userDTO });
  } catch {
    return NextResponse.json<MeResponse>({ user: null });
  }
}
