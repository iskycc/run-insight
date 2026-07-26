import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true },
    });
    if (!existing) return jsonError("NOT_FOUND", "资产不存在", 404);
    const access = await getProjectAccess(prisma, auth.userId, existing.projectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权复用该资产", 403);
    if (existing.status === "ARCHIVED") {
      return jsonError("CONFLICT", "已归档资产不可复用", 409);
    }
    if (existing.status !== "PUBLISHED" && !access.canEdit) {
      return jsonError("FORBIDDEN", "无权复用未发布资产", 403);
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: { reuseCount: { increment: 1 } },
      select: { reuseCount: true },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "REUSE",
      entityType: "asset",
      entityId: id,
      changes: { reused: true },
    });
    return NextResponse.json({ reuseCount: asset.reuseCount });
  } catch {
    return internalError("记录资产复用失败");
  }
}
