import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { validateStringMaxLength } from "@/lib/validations";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function canManageCategory(userId: string, projectId: string | null) {
  if (!projectId) {
    return !(await requireRole(userId, ["ADMIN"], prisma));
  }
  const access = await getProjectAccess(prisma, userId, projectId);
  return access?.canAdmin === true;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.rootCauseCategory.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "根因分类不存在", 404);
    if (!(await canManageCategory(auth.userId, existing.projectId))) {
      return jsonError("FORBIDDEN", "无权管理该根因分类", 403);
    }

    const body: {
      name?: unknown;
      description?: unknown;
      archived?: unknown;
    } = await request.json();
    const data: {
      name?: string;
      description?: string | null;
      archived?: boolean;
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return jsonError("VALIDATION_ERROR", "分类名称不能为空");
      }
      data.name = body.name.trim();
      const error = validateStringMaxLength(data.name, 100, "分类名称");
      if (error) return jsonError("VALIDATION_ERROR", error);
      const duplicate = await prisma.rootCauseCategory.findFirst({
        where: {
          projectId: existing.projectId,
          name: data.name,
          NOT: { id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return jsonError("CONFLICT", "同一范围内已存在该根因分类", 409);
      }
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        return jsonError("VALIDATION_ERROR", "分类说明格式不正确");
      }
      data.description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;
      if (data.description) {
        const error = validateStringMaxLength(data.description, 1000, "分类说明");
        if (error) return jsonError("VALIDATION_ERROR", error);
      }
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") {
        return jsonError("VALIDATION_ERROR", "归档状态格式不正确");
      }
      data.archived = body.archived;
    }
    if (Object.keys(data).length === 0) {
      return jsonError("VALIDATION_ERROR", "没有可更新的字段");
    }

    const category = await prisma.rootCauseCategory.update({
      where: { id },
      data,
    });
    await writeAuditLog({
      userId: auth.userId,
      action: body.archived === true
        ? "ARCHIVE"
        : body.archived === false
          ? "UNARCHIVE"
          : "UPDATE",
      entityType: "rootCauseCategory",
      entityId: id,
      changes: data,
    });
    return NextResponse.json({
      category: {
        ...category,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      return jsonError("CONFLICT", "同一范围内已存在该根因分类", 409);
    }
    return internalError("更新根因分类失败");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.rootCauseCategory.findUnique({
      where: { id },
      include: { _count: { select: { cases: true, assets: true } } },
    });
    if (!existing) return jsonError("NOT_FOUND", "根因分类不存在", 404);
    if (!(await canManageCategory(auth.userId, existing.projectId))) {
      return jsonError("FORBIDDEN", "无权管理该根因分类", 403);
    }
    if (existing._count.cases > 0 || existing._count.assets > 0) {
      return jsonError(
        "CONFLICT",
        "根因分类已被用例或资产引用，请改为归档",
        409
      );
    }

    await prisma.rootCauseCategory.delete({ where: { id } });
    await writeAuditLog({
      userId: auth.userId,
      action: "DELETE",
      entityType: "rootCauseCategory",
      entityId: id,
    });
    return NextResponse.json({ deleted: true });
  } catch {
    return internalError("删除根因分类失败");
  }
}
