import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { BatchSaveAssetRequest, BatchSaveAssetResponse } from "@/types";

export async function POST(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

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

    return NextResponse.json<BatchSaveAssetResponse>({ updated: result.count });
  } catch {
    return internalError("批量保存资产失败");
  }
}
