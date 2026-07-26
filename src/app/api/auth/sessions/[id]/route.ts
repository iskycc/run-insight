import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  createLogoutCookie,
} from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const session = await prisma.session.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true, revokedAt: true },
    });
    if (!session) {
      return jsonError("NOT_FOUND", "登录会话不存在", 404);
    }
    if (session.revokedAt) {
      return jsonError("CONFLICT", "登录会话已注销", 409);
    }

    const revokedAt = new Date();
    const result = await prisma.session.updateMany({
      where: { id, userId: auth.userId, revokedAt: null },
      data: { revokedAt },
    });
    if (result.count !== 1) {
      return jsonError("CONFLICT", "登录会话已注销", 409);
    }
    await writeAuditLog({
      userId: auth.userId,
      action: "LOGOUT",
      entityType: "session",
      entityId: id,
      changes: { revokedAt: revokedAt.toISOString(), revokedByUser: true },
    });

    const response = NextResponse.json({
      revoked: true,
      current: id === auth.sessionId,
    });
    if (id === auth.sessionId) {
      response.headers.set("set-cookie", createLogoutCookie());
    }
    return response;
  } catch (error) {
    return internalError("注销登录会话失败", {
      request,
      error,
      event: "session.revoke_failed",
      context: { userId: auth.userId },
    });
  }
}
