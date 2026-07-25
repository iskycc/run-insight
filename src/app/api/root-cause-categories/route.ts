import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { validateStringMaxLength } from "@/lib/validations";
import type { RootCauseCategoriesResponse } from "@/types";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function serializeCategory(category: {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: { cases: number; assets: number };
}) {
  return {
    id: category.id,
    projectId: category.projectId,
    name: category.name,
    description: category.description,
    archived: category.archived,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    usageCount: category._count
      ? category._count.cases + category._count.assets
      : undefined,
  };
}

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const includeArchived = searchParams.get("includeArchived") === "true";
    let canManage = false;

    if (projectId) {
      const access = await getProjectAccess(prisma, auth.userId, projectId);
      if (!access?.canView) {
        return jsonError("FORBIDDEN", "无权访问该项目的根因分类", 403);
      }
      canManage = access.canAdmin;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { role: true },
      });
      canManage = user?.role === "ADMIN";
    }

    const categories = await prisma.rootCauseCategory.findMany({
      where: {
        ...(includeArchived ? {} : { archived: false }),
        ...(projectId
          ? { OR: [{ projectId: null }, { projectId }] }
          : { projectId: null }),
      },
      include: { _count: { select: { cases: true, assets: true } } },
      orderBy: [{ projectId: "asc" }, { name: "asc" }],
    });

    return NextResponse.json<RootCauseCategoriesResponse>({
      categories: categories.map(serializeCategory),
      canManage,
    });
  } catch {
    return internalError("获取根因分类失败");
  }
}

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body: {
      projectId?: unknown;
      name?: unknown;
      description?: unknown;
    } = await request.json();
    const projectId =
      typeof body.projectId === "string" && body.projectId ? body.projectId : null;

    if (projectId) {
      const access = await getProjectAccess(prisma, auth.userId, projectId);
      if (!access?.canAdmin) {
        return jsonError("FORBIDDEN", "只有项目管理员可以创建项目根因分类", 403);
      }
    } else {
      const roleCheck = await requireRole(auth.userId, ["ADMIN"], prisma);
      if (roleCheck) return roleCheck;
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
      return jsonError("VALIDATION_ERROR", "分类名称不能为空");
    }
    const name = body.name.trim();
    const nameError = validateStringMaxLength(name, 100, "分类名称");
    if (nameError) return jsonError("VALIDATION_ERROR", nameError);

    if (body.description !== undefined && typeof body.description !== "string") {
      return jsonError("VALIDATION_ERROR", "分类说明格式不正确");
    }
    const description = (body.description as string | undefined)?.trim() || null;
    if (description) {
      const error = validateStringMaxLength(description, 1000, "分类说明");
      if (error) return jsonError("VALIDATION_ERROR", error);
    }

    const duplicate = await prisma.rootCauseCategory.findFirst({
      where: { projectId, name },
      select: { id: true },
    });
    if (duplicate) {
      return jsonError("CONFLICT", "同一范围内已存在该根因分类", 409);
    }

    const category = await prisma.rootCauseCategory.create({
      data: { projectId, name, description },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "CREATE",
      entityType: "rootCauseCategory",
      entityId: category.id,
      changes: { projectId, name, description },
    });
    return NextResponse.json(
      { category: serializeCategory(category) },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      return jsonError("CONFLICT", "同一范围内已存在该根因分类", 409);
    }
    return internalError("创建根因分类失败");
  }
}
