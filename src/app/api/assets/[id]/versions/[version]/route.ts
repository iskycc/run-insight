import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import {
  assetVersionInclude,
  buildAssetVersionDiff,
  canRollbackAsset,
  toAssetVersionDTO,
} from "@/lib/assets";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import type { AssetVersionDetailResponse } from "@/types";

function parseVersion(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, version: rawVersion } = await params;
    const versionNumber = parseVersion(rawVersion);
    if (!versionNumber) {
      return jsonError("VALIDATION_ERROR", "版本号不合法");
    }
    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true },
    });
    if (!asset) return jsonError("NOT_FOUND", "资产不存在", 404);
    const access = await getProjectAccess(prisma, auth.userId, asset.projectId);
    if (!access?.canEdit) {
      return jsonError("FORBIDDEN", "无权查看该资产的版本详情", 403);
    }

    const version = await prisma.assetVersion.findUnique({
      where: {
        assetId_version: { assetId: id, version: versionNumber },
      },
      include: assetVersionInclude,
    });
    if (!version) return jsonError("NOT_FOUND", "资产版本不存在", 404);

    const requestedCompare = new URL(request.url).searchParams.get("compareTo");
    const compareNumber = requestedCompare === null
      ? null
      : parseVersion(requestedCompare);
    if (requestedCompare !== null && !compareNumber) {
      return jsonError("VALIDATION_ERROR", "对比版本号不合法");
    }
    const compareTo = compareNumber
      ? await prisma.assetVersion.findUnique({
          where: {
            assetId_version: { assetId: id, version: compareNumber },
          },
          include: assetVersionInclude,
        })
      : await prisma.assetVersion.findFirst({
          where: { assetId: id, version: { lt: versionNumber } },
          include: assetVersionInclude,
          orderBy: { version: "desc" },
        });
    if (compareNumber && !compareTo) {
      return jsonError("NOT_FOUND", "对比版本不存在", 404);
    }

    const versionDTO = toAssetVersionDTO(version);
    const compareDTO = compareTo ? toAssetVersionDTO(compareTo) : null;
    return NextResponse.json<AssetVersionDetailResponse>({
      version: versionDTO,
      compareTo: compareDTO,
      changes: buildAssetVersionDiff(compareDTO, versionDTO),
      canRollback: canRollbackAsset(asset.status, access),
    });
  } catch {
    return internalError("获取资产版本详情失败");
  }
}
