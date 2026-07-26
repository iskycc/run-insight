import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, createLogoutCookie } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (!(authResult instanceof NextResponse)) {
    if (authResult.sessionId) {
      await prisma.session.updateMany({
        where: {
          id: authResult.sessionId,
          userId: authResult.userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    await writeAuditLog({
      userId: authResult.userId,
      action: "LOGOUT",
      entityType: "session",
      entityId: authResult.sessionId ?? authResult.userId,
    });
  }
  const response = NextResponse.json({ success: true });
  response.headers.set("set-cookie", createLogoutCookie());
  return response;
}
