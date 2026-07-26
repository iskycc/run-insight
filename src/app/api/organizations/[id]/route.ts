import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError, parseJsonObject } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const membership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: id, userId: auth.userId } },
      select: { role: true },
    });
    if (!membership) return jsonError("NOT_FOUND", "组织不存在或无权访问", 404);
    if (membership.role !== "OWNER") {
      return jsonError("FORBIDDEN", "只有组织所有者可以修改组织", 403);
    }

    const parsed = await parseJsonObject(request, ["name", "archived"]);
    if (!parsed.ok) return parsed.response;
    const data: { name?: string; archived?: boolean } = {};
    if (parsed.value.name !== undefined) {
      if (typeof parsed.value.name !== "string" || !parsed.value.name.trim()) {
        return jsonError("VALIDATION_ERROR", "组织名称不能为空");
      }
      if (parsed.value.name.trim().length > 100) {
        return jsonError("VALIDATION_ERROR", "组织名称长度不能超过100个字符");
      }
      data.name = parsed.value.name.trim();
    }
    if (parsed.value.archived !== undefined) {
      if (typeof parsed.value.archived !== "boolean") {
        return jsonError("VALIDATION_ERROR", "归档状态必须为布尔值");
      }
      data.archived = parsed.value.archived;
    }
    if (Object.keys(data).length === 0) {
      return jsonError("VALIDATION_ERROR", "没有可更新的字段");
    }

    const organization = await prisma.organization.update({
      where: { id },
      data,
      select: { id: true, name: true, archived: true, updatedAt: true },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: data.archived === true
        ? "ARCHIVE"
        : data.archived === false
          ? "UNARCHIVE"
          : "UPDATE",
      entityType: "organization",
      entityId: id,
      changes: data,
    });
    return NextResponse.json({
      organization: {
        ...organization,
        updatedAt: organization.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return jsonError("CONFLICT", "组织名称已存在", 409);
    }
    return internalError("修改组织失败", {
      request,
      error,
      event: "organization.update_failed",
    });
  }
}
