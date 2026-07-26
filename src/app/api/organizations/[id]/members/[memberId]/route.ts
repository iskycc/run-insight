import { NextRequest, NextResponse } from "next/server";
import type { OrganizationRole } from "@/generated/prisma/enums";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError, parseJsonObject } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { canManageOrganization } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

const ROLES = new Set<OrganizationRole>(["OWNER", "ADMIN", "MEMBER"]);

async function authorize(organizationId: string, userId: string) {
  return prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: organizationId, memberId } = await params;
    const actor = await authorize(organizationId, auth.userId);
    if (!actor) return jsonError("NOT_FOUND", "组织不存在或无权访问", 404);
    if (!canManageOrganization(actor.role)) {
      return jsonError("FORBIDDEN", "只有组织所有者或管理员可以管理成员", 403);
    }
    const parsed = await parseJsonObject(request, ["role"]);
    if (!parsed.ok) return parsed.response;
    const role = parsed.value.role;
    if (typeof role !== "string" || !ROLES.has(role as OrganizationRole)) {
      return jsonError("VALIDATION_ERROR", "组织角色不合法");
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId },
      });
      if (!existing) return { status: "not-found" as const };
      if (
        actor.role !== "OWNER" &&
        (existing.role === "OWNER" || role === "OWNER")
      ) {
        return { status: "owner-only" as const };
      }
      if (existing.role === "OWNER" && role !== "OWNER") {
        const owners = await tx.organizationMember.count({
          where: { organizationId, role: "OWNER" },
        });
        if (owners <= 1) return { status: "last-owner" as const };
      }
      const member = await tx.organizationMember.update({
        where: { id: memberId },
        data: { role: role as OrganizationRole },
        include: { user: { select: { username: true } } },
      });
      return { status: "updated" as const, member };
    }, { isolationLevel: "Serializable" });

    if (result.status === "not-found") {
      return jsonError("NOT_FOUND", "组织成员不存在", 404);
    }
    if (result.status === "owner-only") {
      return jsonError("FORBIDDEN", "只有组织所有者可以管理所有者", 403);
    }
    if (result.status === "last-owner") {
      return jsonError("CONFLICT", "组织必须保留至少一名所有者", 409);
    }

    await writeAuditLog({
      userId: auth.userId,
      action: "UPDATE",
      entityType: "organizationMember",
      entityId: result.member.id,
      changes: {
        organizationId,
        memberUserId: result.member.userId,
        role: result.member.role,
      },
    });
    return NextResponse.json({
      member: {
        id: result.member.id,
        organizationId: result.member.organizationId,
        userId: result.member.userId,
        username: result.member.user.username,
        role: result.member.role,
        createdAt: result.member.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return internalError("修改组织成员失败", {
      request,
      error,
      event: "organization_member.update_failed",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: organizationId, memberId } = await params;
    const actor = await authorize(organizationId, auth.userId);
    if (!actor) return jsonError("NOT_FOUND", "组织不存在或无权访问", 404);
    if (!canManageOrganization(actor.role)) {
      return jsonError("FORBIDDEN", "只有组织所有者或管理员可以管理成员", 403);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId },
      });
      if (!existing) return { status: "not-found" as const };
      if (actor.role !== "OWNER" && existing.role === "OWNER") {
        return { status: "owner-only" as const };
      }
      if (existing.role === "OWNER") {
        const owners = await tx.organizationMember.count({
          where: { organizationId, role: "OWNER" },
        });
        if (owners <= 1) return { status: "last-owner" as const };
      }

      await tx.projectMember.deleteMany({
        where: { userId: existing.userId, project: { organizationId } },
      });
      await tx.organizationMember.delete({ where: { id: memberId } });
      return { status: "deleted" as const, member: existing };
    }, { isolationLevel: "Serializable" });

    if (result.status === "not-found") {
      return jsonError("NOT_FOUND", "组织成员不存在", 404);
    }
    if (result.status === "owner-only") {
      return jsonError("FORBIDDEN", "只有组织所有者可以移除所有者", 403);
    }
    if (result.status === "last-owner") {
      return jsonError("CONFLICT", "组织必须保留至少一名所有者", 409);
    }
    await writeAuditLog({
      userId: auth.userId,
      action: "DELETE",
      entityType: "organizationMember",
      entityId: memberId,
      changes: {
        organizationId,
        memberUserId: result.member.userId,
        role: result.member.role,
      },
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return internalError("移除组织成员失败", {
      request,
      error,
      event: "organization_member.delete_failed",
    });
  }
}
