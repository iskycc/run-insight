import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import type { AssetStatus } from "@/generated/prisma/enums";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import {
  assetInclude,
  assetVersionSnapshot,
  toAssetDTO,
} from "@/lib/assets";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import {
  isValidAssetStatus,
  validateStringMaxLength,
  validateTags,
} from "@/lib/validations";
import type { AssetsResponse, CreateAssetRequest } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
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
        const canReview =
          user.role === "ADMIN" || membership?.role === "ADMIN";
        const { members: _members, ...project } = asset.project;
        return toAssetDTO({ ...asset, project }, canEdit, canReview);
      }),
      total,
      page,
      pageSize,
    });
  } catch {
    return internalError("获取资产列表失败");
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const rawBody: unknown = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return jsonError("VALIDATION_ERROR", "资产创建数据格式不正确");
    }
    const body = rawBody as Record<string, unknown>;
    const allowedFields = new Set([
      "projectId",
      "title",
      "summary",
      "solution",
      "rootCauseCategoryId",
      "rootCauseText",
      "tags",
    ]);
    const unknownField = Object.keys(body).find(
      (field) => !allowedFields.has(field),
    );
    if (unknownField) {
      return jsonError("VALIDATION_ERROR", `不支持的字段：${unknownField}`);
    }
    if (typeof body.projectId !== "string" || !body.projectId) {
      return jsonError("VALIDATION_ERROR", "项目为必填");
    }

    const content: Pick<
      CreateAssetRequest,
      "title" | "summary" | "solution"
    > = { title: "", summary: "", solution: "" };
    for (const [field, label, maxLength] of [
      ["title", "资产标题", 200],
      ["summary", "资产摘要", 5000],
      ["solution", "解决方案", 10000],
    ] as const) {
      if (typeof body[field] !== "string" || !body[field].trim()) {
        return jsonError("VALIDATION_ERROR", `${label}不能为空`);
      }
      const value = body[field].trim();
      const error = validateStringMaxLength(value, maxLength, label);
      if (error) return jsonError("VALIDATION_ERROR", error);
      content[field] = value;
    }

    let rootCauseText: string | null = null;
    if (body.rootCauseText !== undefined && body.rootCauseText !== null) {
      if (typeof body.rootCauseText !== "string") {
        return jsonError("VALIDATION_ERROR", "根因补充格式不正确");
      }
      rootCauseText = body.rootCauseText.trim() || null;
      if (rootCauseText) {
        const error = validateStringMaxLength(
          rootCauseText,
          2000,
          "根因补充",
        );
        if (error) return jsonError("VALIDATION_ERROR", error);
      }
    }
    const tags = body.tags === undefined ? [] : validateTags(body.tags);
    if (!tags) {
      return jsonError(
        "VALIDATION_ERROR",
        "标签必须为不超过20项、每项不超过30字符的字符串数组",
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { id: true },
    });
    if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
    const access = await getProjectAccess(
      prisma,
      auth.userId,
      body.projectId,
    );
    if (!access?.canEdit) {
      return jsonError("FORBIDDEN", "无权在该项目创建资产", 403);
    }

    let rootCauseCategoryId: string | null = null;
    if (
      body.rootCauseCategoryId !== undefined
      && body.rootCauseCategoryId !== null
    ) {
      if (typeof body.rootCauseCategoryId !== "string") {
        return jsonError("VALIDATION_ERROR", "根因分类格式不正确");
      }
      const category = await prisma.rootCauseCategory.findUnique({
        where: { id: body.rootCauseCategoryId },
        select: { id: true, projectId: true, archived: true },
      });
      if (
        !category
        || category.archived
        || (category.projectId !== null && category.projectId !== body.projectId)
      ) {
        return jsonError("VALIDATION_ERROR", "根因分类不属于该项目或已归档");
      }
      rootCauseCategoryId = category.id;
    }

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          projectId: body.projectId as string,
          rootCauseCategoryId,
          ...content,
          rootCauseText,
          tags,
          status: "DRAFT",
          createdBy: auth.userId,
          updatedBy: auth.userId,
        },
        include: assetInclude,
      });
      await tx.assetVersion.create({
        data: assetVersionSnapshot(created, auth.userId),
      });
      return created;
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "CREATE",
      entityType: "asset",
      entityId: asset.id,
      changes: { projectId: body.projectId, version: asset.version },
    });

    return NextResponse.json(
      { asset: toAssetDTO(asset, true, access.canAdmin) },
      { status: 201 },
    );
  } catch {
    return internalError("创建资产失败");
  }
}
