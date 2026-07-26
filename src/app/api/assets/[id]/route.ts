import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import {
  assetInclude,
  assetVersionSnapshot,
  canTransitionAssetStatus,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.asset.findUnique({
      where: { id },
      include: assetInclude,
    });
    if (!existing) return jsonError("NOT_FOUND", "资产不存在", 404);

    const access = await getProjectAccess(prisma, auth.userId, existing.projectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权查看该资产", 403);
    if (existing.status !== "PUBLISHED" && !access.canEdit) {
      return jsonError("FORBIDDEN", "无权查看未发布或已归档资产", 403);
    }

    return NextResponse.json({
      asset: toAssetDTO(existing, access.canEdit, access.canAdmin),
    });
  } catch {
    return internalError("获取资产详情失败");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "资产不存在", 404);
    const access = await getProjectAccess(prisma, auth.userId, existing.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权编辑该资产", 403);

    const rawBody: unknown = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return jsonError("VALIDATION_ERROR", "资产更新数据格式不正确");
    }
    const body = rawBody as Record<string, unknown>;
    const data: Prisma.AssetUpdateInput = {};
    const contentFields = [
      "title",
      "summary",
      "solution",
      "rootCauseText",
      "rootCauseCategoryId",
      "tags",
    ] as const;
    const unknownField = Object.keys(body).find(
      (field) => !contentFields.includes(
        field as (typeof contentFields)[number],
      ) && field !== "status",
    );
    if (unknownField) {
      return jsonError("VALIDATION_ERROR", `不支持的字段：${unknownField}`);
    }
    const hasContentUpdate = contentFields.some(
      (field) => body[field] !== undefined,
    );
    if (body.status !== undefined && hasContentUpdate) {
      return jsonError(
        "VALIDATION_ERROR",
        "内容编辑与审核状态流转必须分别提交",
      );
    }
    if (hasContentUpdate && existing.status !== "DRAFT") {
      return jsonError("CONFLICT", "仅草稿状态可以编辑内容", 409);
    }

    for (const [field, label, maxLength] of [
      ["title", "资产标题", 200],
      ["summary", "资产摘要", 5000],
      ["solution", "解决方案", 10000],
    ] as const) {
      if (body[field] !== undefined) {
        if (typeof body[field] !== "string" || !body[field].trim()) {
          return jsonError("VALIDATION_ERROR", `${label}不能为空`);
        }
        const value = body[field].trim();
        const error = validateStringMaxLength(value, maxLength, label);
        if (error) return jsonError("VALIDATION_ERROR", error);
        data[field] = value;
      }
    }

    if (body.rootCauseText !== undefined) {
      if (body.rootCauseText !== null && typeof body.rootCauseText !== "string") {
        return jsonError("VALIDATION_ERROR", "根因补充格式不正确");
      }
      const value =
        typeof body.rootCauseText === "string" && body.rootCauseText.trim()
          ? body.rootCauseText.trim()
          : null;
      if (value) {
        const error = validateStringMaxLength(value, 2000, "根因补充");
        if (error) return jsonError("VALIDATION_ERROR", error);
      }
      data.rootCauseText = value;
    }

    if (body.rootCauseCategoryId !== undefined) {
      if (
        body.rootCauseCategoryId !== null &&
        typeof body.rootCauseCategoryId !== "string"
      ) {
        return jsonError("VALIDATION_ERROR", "根因分类格式不正确");
      }
      if (body.rootCauseCategoryId) {
        const category = await prisma.rootCauseCategory.findUnique({
          where: { id: body.rootCauseCategoryId },
        });
        if (
          !category ||
          category.archived ||
          (category.projectId !== null && category.projectId !== existing.projectId)
        ) {
          return jsonError("VALIDATION_ERROR", "根因分类不属于该项目或已归档");
        }
        data.rootCauseCategory = { connect: { id: category.id } };
      } else {
        data.rootCauseCategory = { disconnect: true };
      }
    }

    if (body.tags !== undefined) {
      const tags = validateTags(body.tags);
      if (!tags) {
        return jsonError(
          "VALIDATION_ERROR",
          "标签必须为不超过20项、每项不超过30字符的字符串数组"
        );
      }
      data.tags = tags;
    }

    if (body.status !== undefined) {
      if (!isValidAssetStatus(body.status)) {
        return jsonError("VALIDATION_ERROR", "资产状态不合法");
      }
      if (
        !canTransitionAssetStatus(existing.status, body.status, access)
      ) {
        const needsAdmin =
          body.status === "PUBLISHED"
          || body.status === "ARCHIVED"
          || (existing.status === "REVIEW" && body.status === "DRAFT")
          || existing.status === "ARCHIVED";
        return needsAdmin && !access.canAdmin
          ? jsonError("FORBIDDEN", "仅项目管理员可以执行该审核操作", 403)
          : jsonError("CONFLICT", "资产状态流转不合法", 409);
      }
      data.status = body.status;
    }

    if (Object.keys(data).length === 0) {
      return jsonError("VALIDATION_ERROR", "没有可更新的字段");
    }
    data.updater = { connect: { id: auth.userId } };
    data.version = { increment: 1 };

    const asset = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id },
        data,
        include: assetInclude,
      });
      await tx.assetVersion.create({
        data: assetVersionSnapshot(updated, auth.userId),
      });
      return updated;
    });
    await writeAuditLog({
      userId: auth.userId,
      action: body.status === "ARCHIVED"
        ? "ARCHIVE"
        : existing.status === "ARCHIVED" && body.status !== undefined
          ? "UNARCHIVE"
          : "UPDATE",
      entityType: "asset",
      entityId: id,
      changes: body,
    });
    return NextResponse.json({
      asset: toAssetDTO(asset, true, access.canAdmin),
    });
  } catch {
    return internalError("更新资产失败");
  }
}
