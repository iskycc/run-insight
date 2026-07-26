import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { serializeSession } from "@/lib/sessions";
import type { SessionsResponse } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const sessions = await prisma.session.findMany({
      where: { userId: auth.userId },
      select: {
        id: true,
        deviceInfo: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { lastSeenAt: "desc" },
      take: 30,
    });
    const now = new Date();
    return NextResponse.json<SessionsResponse>({
      sessions: sessions.map((session) =>
        serializeSession(session, auth.sessionId, now),
      ),
    });
  } catch (error) {
    return internalError("获取登录会话失败", {
      request,
      error,
      event: "session.list_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await prisma.session.updateMany({
      where: {
        userId: auth.userId,
        revokedAt: null,
        ...(auth.sessionId ? { NOT: { id: auth.sessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "LOGOUT",
      entityType: "session",
      entityId: auth.sessionId ?? auth.userId,
      changes: { revokedOtherSessions: result.count },
    });
    return NextResponse.json({ revoked: result.count });
  } catch (error) {
    return internalError("注销其他会话失败", {
      request,
      error,
      event: "session.revoke_others_failed",
      context: { userId: auth.userId },
    });
  }
}
