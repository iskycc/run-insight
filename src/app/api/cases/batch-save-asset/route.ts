import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import type { BatchSaveAssetRequest, BatchSaveAssetResponse } from "@/types";

export async function POST(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN", "EDITOR"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const body: BatchSaveAssetRequest = await request.json();
    const { caseIds } = body;

    if (!caseIds || !Array.isArray(caseIds) || caseIds.length === 0) {
      return jsonError("VALIDATION_ERROR", "请提供要保存资产的用例ID列表");
    }

    const result = await prisma.caseResult.updateMany({
      where: {
        id: { in: caseIds },
        progressCategory: { not: null },
        assetSaved: false,
      },
      data: { assetSaved: true },
    });

    for (const caseId of caseIds) {
      await writeAuditLog({
        userId: authResult.userId,
        action: "UPDATE",
        entityType: "case",
        entityId: caseId,
        changes: { assetSaved: true },
      });
    }

    return NextResponse.json<BatchSaveAssetResponse>({ updated: result.count });
  } catch {
    return internalError("批量保存资产失败");
  }
}
