import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import type { AssetStatus } from "@/generated/prisma/enums";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { toAssetDTO } from "@/lib/assets";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { isValidAssetStatus } from "@/lib/validations";
import type { AssetsResponse } from "@/types";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(searchParams.get("pageSize") || "20", 10) || 20)
    );
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const tag = searchParams.get("tag")?.trim();
    const rootCauseCategoryId = searchParams.get("rootCauseCategoryId");
    const rootCause = searchParams.get("rootCause")?.trim();
    const search = searchParams.get("search")?.trim();

    if (status && !isValidAssetStatus(status)) {
      return jsonError("VALIDATION_ERROR", "资产状态不合法");
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });
    if (!user) return jsonError("UNAUTHORIZED", "用户不存在", 401);

    let projectCanEdit = false;
    if (projectId) {
      const access = await getProjectAccess(prisma, auth.userId, projectId);
      if (!access?.canView) {
        return jsonError("FORBIDDEN", "无权访问该项目的资产", 403);
      }
      projectCanEdit = access.canEdit;
      if (!projectCanEdit && status && status !== "PUBLISHED") {
        return jsonError("FORBIDDEN", "无权查看未发布或已归档资产", 403);
      }
    }

    const where: Prisma.AssetWhereInput = {
      ...(projectId ? { projectId } : {}),
      ...(user.role === "ADMIN" || projectCanEdit
        ? {}
        : projectId
          ? { status: "PUBLISHED" }
          : {
              OR: [
                {
                  status: "PUBLISHED",
                  project: { members: { some: { userId: auth.userId } } },
                },
                {
                  project: {
                    members: {
                      some: {
                        userId: auth.userId,
                        role: { in: ["ADMIN", "EDITOR"] },
                      },
                    },
                  },
                },
              ],
            }),
      ...(status ? { status: status as AssetStatus } : {}),
      ...(tag ? { tags: { array_contains: tag } } : {}),
      ...(rootCauseCategoryId ? { rootCauseCategoryId } : {}),
      ...(rootCause ? { rootCauseText: { contains: rootCause } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { summary: { contains: search } },
              { solution: { contains: search } },
              { rootCauseText: { contains: search } },
              { sourceCase: { is: { caseNo: { contains: search } } } },
              { sourceCase: { is: { name: { contains: search } } } },
            ],
          }
        : {}),
    };

    const include = {
      project: {
        select: {
          id: true,
          name: true,
          members: {
            where: { userId: auth.userId },
            select: { role: true },
            take: 1,
          },
        },
      },
      rootCauseCategory: { select: { id: true, name: true } },
      sourceCase: {
        select: { id: true, caseNo: true, name: true, resultSummary: true },
      },
      creator: { select: { username: true } },
      updater: { select: { username: true } },
    } as const;

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        include,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.asset.count({ where }),
    ]);

    return NextResponse.json<AssetsResponse>({
      assets: assets.map((asset) => {
        const membership = asset.project.members[0];
        const canEdit =
          user.role === "ADMIN" ||
          membership?.role === "ADMIN" ||
          membership?.role === "EDITOR";
        const { members: _members, ...project } = asset.project;
        return toAssetDTO({ ...asset, project }, canEdit);
      }),
      total,
      page,
      pageSize,
    });
  } catch {
    return internalError("获取资产列表失败");
  }
}
