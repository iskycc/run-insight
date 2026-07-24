import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const existing = await prisma.testStage.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "阶段不存在", 404);

    await prisma.testStage.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch {
    return internalError("删除阶段失败");
  }
}