import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { buildAssetSnapshot } from "@/lib/assets";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import type { BatchSaveAssetRequest, BatchSaveAssetResponse } from "@/types";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as BatchSaveAssetRequest;
    if (
      !Array.isArray(body.caseIds) ||
      body.caseIds.length === 0 ||
      body.caseIds.length > 200 ||
      body.caseIds.some((id) => typeof id !== "string")
    ) {
      return jsonError(
        "VALIDATION_ERROR",
        "请提供1至200个要保存资产的用例ID"
      );
    }
    const caseIds = [...new Set(body.caseIds)];
    const cases = await prisma.caseResult.findMany({
      where: { id: { in: caseIds } },
    });
    if (cases.length !== caseIds.length) {
      return jsonError("NOT_FOUND", "部分用例不存在", 404);
    }
    if (cases.some((item) => !item.progressCategory)) {
      return jsonError("VALIDATION_ERROR", "部分用例尚未填写进展分类");
    }

    for (const projectId of new Set(cases.map((item) => item.projectId))) {
      const access = await getProjectAccess(prisma, auth.userId, projectId);
      if (!access?.canEdit) {
        return jsonError("FORBIDDEN", "无权保存部分项目的资产", 403);
      }
    }

    const savedAssets = await prisma.$transaction(async (tx) => {
      const assets: Array<{ id: string; sourceCaseId: string | null }> = [];
      for (const item of cases) {
        const snapshot = buildAssetSnapshot(item);
        const asset = await tx.asset.upsert({
          where: { sourceCaseId: item.id },
          create: {
            sourceCaseId: item.id,
            projectId: item.projectId,
            rootCauseCategoryId: item.rootCauseCategoryId,
            ...snapshot,
            tags: [],
            status: "DRAFT",
            createdBy: auth.userId,
            updatedBy: auth.userId,
          },
          update: {
            // Preserve manually curated knowledge when the source case is
            // saved again. There are no separate snapshot fields yet.
          },
          select: { id: true, sourceCaseId: true },
        });
        assets.push(asset);
      }
      await tx.caseResult.updateMany({
        where: { id: { in: caseIds } },
        data: { assetSaved: true },
      });
      return assets;
    });

    const caseById = new Map(cases.map((item) => [item.id, item]));
    for (const asset of savedAssets) {
      const item = asset.sourceCaseId ? caseById.get(asset.sourceCaseId) : undefined;
      await writeAuditLog({
        userId: auth.userId,
        action: item?.assetSaved ? "UPDATE" : "CREATE",
        entityType: "asset",
        entityId: asset.id,
        changes: { sourceCaseId: asset.sourceCaseId, batch: true },
      });
    }
    return NextResponse.json<BatchSaveAssetResponse>({ updated: cases.length });
  } catch {
    return internalError("批量保存资产失败");
  }
}
