import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id, keyId } = await params;
    const record = await prisma.apiKey.findFirst({
      where: { id: keyId, projectId: id },
    });

    if (!record) {
      return jsonError("NOT_FOUND", "API Key 不存在", 404);
    }

    await prisma.apiKey.delete({ where: { id: keyId } });

    return NextResponse.json({ deleted: true });
  } catch {
    return internalError("删除 API Key 失败");
  }
}