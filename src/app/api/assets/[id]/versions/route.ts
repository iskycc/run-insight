import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import {
  assetVersionInclude,
  canRollbackAsset,
  toAssetVersionDTO,
} from "@/lib/assets";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import type { AssetVersionsResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true },
    });
    if (!asset) return jsonError("NOT_FOUND", "资产不存在", 404);
    const access = await getProjectAccess(prisma, auth.userId, asset.projectId);
    if (!access?.canEdit) {
      return jsonError("FORBIDDEN", "无权查看该资产的版本历史", 403);
    }

    const versions = await prisma.assetVersion.findMany({
      where: { assetId: id },
      include: assetVersionInclude,
      orderBy: { version: "desc" },
    });
    return NextResponse.json<AssetVersionsResponse>({
      versions: versions.map(toAssetVersionDTO),
      canRollback: canRollbackAsset(asset.status, access),
    });
  } catch {
    return internalError("获取资产版本历史失败");
  }
}
