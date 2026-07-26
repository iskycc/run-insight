import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import {
  assetInclude,
  assetVersionSnapshot,
  buildAssetSnapshot,
  toAssetDTO,
} from "@/lib/assets";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { toCaseDTO } from "@/lib/serializers";
import { isValidCuid } from "@/lib/validations";
import type { SaveAssetResponse } from "@/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (!isValidCuid(id)) {
      return jsonError("VALIDATION_ERROR", "无效的用例ID");
    }

    const existing = await prisma.caseResult.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "用例不存在", 404);
    const access = await getProjectAccess(prisma, auth.userId, existing.projectId);
    if (!access?.canEdit) {
      return jsonError("FORBIDDEN", "无权将该项目的用例保存为资产", 403);
    }
    if (!existing.progressCategory) {
      return jsonError("VALIDATION_ERROR", "该用例尚未填写进展分类，无法保存为资产");
    }

    const snapshot = buildAssetSnapshot(existing);
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.upsert({
        where: { sourceCaseId: id },
        create: {
          sourceCaseId: id,
          projectId: existing.projectId,
          rootCauseCategoryId: existing.rootCauseCategoryId,
          ...snapshot,
          tags: [],
          status: "DRAFT",
          createdBy: auth.userId,
          updatedBy: auth.userId,
        },
        update: {
          // Curated asset content must not be overwritten by a repeated save.
          // The current model has no separate source-snapshot fields, so an
          // existing asset is returned unchanged.
        },
        include: assetInclude,
      });
      await tx.assetVersion.upsert({
        where: {
          assetId_version: { assetId: asset.id, version: asset.version },
        },
        create: assetVersionSnapshot(asset, auth.userId),
        update: {},
      });
      const caseResult = await tx.caseResult.update({
        where: { id },
        data: { assetSaved: true },
        include: {
          assigneeUser: { select: { username: true } },
          rootCauseCategory: { select: { id: true, name: true } },
        },
      });
      return { asset, caseResult };
    });

    await writeAuditLog({
      userId: auth.userId,
      action: existing.assetSaved ? "UPDATE" : "CREATE",
      entityType: "asset",
      entityId: result.asset.id,
      changes: { sourceCaseId: id, snapshotUpdated: existing.assetSaved },
    });

    return NextResponse.json<SaveAssetResponse>({
      case: toCaseDTO(result.caseResult),
      asset: toAssetDTO(result.asset, true, access.canAdmin),
    });
  } catch {
    return internalError("保存资产失败");
  }
}
