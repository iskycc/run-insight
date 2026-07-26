import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import {
  assetInclude,
  assetVersionInclude,
  assetVersionSnapshot,
  canRollbackAsset,
  readAssetTags,
  toAssetDTO,
} from "@/lib/assets";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, version: rawVersion } = await params;
    if (!/^[1-9]\d*$/.test(rawVersion)) {
      return jsonError("VALIDATION_ERROR", "版本号不合法");
    }
    const versionNumber = Number(rawVersion);
    if (!Number.isSafeInteger(versionNumber)) {
      return jsonError("VALIDATION_ERROR", "版本号不合法");
    }

    const asset = await prisma.asset.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        status: true,
        version: true,
      },
    });
    if (!asset) return jsonError("NOT_FOUND", "资产不存在", 404);
    const access = await getProjectAccess(prisma, auth.userId, asset.projectId);
    if (!access || !canRollbackAsset(asset.status, access)) {
      return jsonError("FORBIDDEN", "无权回滚该资产", 403);
    }
    if (asset.version === versionNumber) {
      return jsonError("CONFLICT", "目标版本已经是当前版本", 409);
    }

    const target = await prisma.assetVersion.findUnique({
      where: {
        assetId_version: { assetId: id, version: versionNumber },
      },
      include: assetVersionInclude,
    });
    if (!target) return jsonError("NOT_FOUND", "资产版本不存在", 404);

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.asset.update({
        where: { id },
        data: {
          title: target.title,
          summary: target.summary,
          solution: target.solution,
          rootCauseText: target.rootCauseText,
          tags: readAssetTags(target.tags),
          // A rollback restores content into a new draft. Publishing still
          // requires the normal review workflow.
          status: "DRAFT",
          updatedBy: auth.userId,
          version: { increment: 1 },
        },
        include: assetInclude,
      });
      await tx.assetVersion.create({
        data: assetVersionSnapshot(next, auth.userId),
      });
      return next;
    });

    await writeAuditLog({
      userId: auth.userId,
      action: "ROLLBACK",
      entityType: "asset",
      entityId: id,
      changes: {
        fromVersion: asset.version,
        restoredVersion: versionNumber,
        newVersion: updated.version,
      },
    });
    return NextResponse.json({
      asset: toAssetDTO(updated, true, access.canAdmin),
    });
  } catch {
    return internalError("回滚资产版本失败");
  }
}
