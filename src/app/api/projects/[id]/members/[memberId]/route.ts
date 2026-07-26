import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { isValidProjectRole } from "@/lib/validations";

async function authorize(userId: string, projectId: string) {
  const access = await getProjectAccess(prisma, userId, projectId);
  return access?.canAdmin ?? false;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: projectId, memberId } = await params;
    if (!(await authorize(auth.userId, projectId))) {
      return jsonError("FORBIDDEN", "只有项目管理员可以管理成员", 403);
    }
    const body: { role?: unknown } = await request.json();
    const role = body.role;
    if (!isValidProjectRole(role)) {
      return jsonError("VALIDATION_ERROR", "项目角色不合法");
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.projectMember.findFirst({
        where: { id: memberId, projectId },
      });
      if (!existing) return { status: "not-found" as const };

      if (existing.role === "ADMIN" && role !== "ADMIN") {
        const adminCount = await tx.projectMember.count({
          where: { projectId, role: "ADMIN" },
        });
        if (adminCount <= 1) return { status: "last-admin" as const };
      }

      const member = await tx.projectMember.update({
        where: { id: memberId },
        data: { role },
        include: { user: { select: { username: true, role: true } } },
      });
      return { status: "updated" as const, member };
    }, { isolationLevel: "Serializable" });

    if (result.status === "not-found") {
      return jsonError("NOT_FOUND", "项目成员不存在", 404);
    }
    if (result.status === "last-admin") {
      return jsonError("CONFLICT", "项目必须保留至少一名项目管理员", 409);
    }

    const { member } = result;
    await writeAuditLog({
      userId: auth.userId,
      action: "UPDATE",
      entityType: "member",
      entityId: member.id,
      changes: {
        projectId,
        memberUserId: member.userId,
        role: member.role,
      },
    });
    return NextResponse.json({
      member: {
        id: member.id,
        projectId: member.projectId,
        userId: member.userId,
        username: member.user.username,
        systemRole: member.user.role,
        role: member.role,
        createdAt: member.createdAt.toISOString(),
      },
    });
  } catch {
    return internalError("修改项目成员失败");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: projectId, memberId } = await params;
    if (!(await authorize(auth.userId, projectId))) {
      return jsonError("FORBIDDEN", "只有项目管理员可以管理成员", 403);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.projectMember.findFirst({
        where: { id: memberId, projectId },
      });
      if (!existing) return { status: "not-found" as const };

      if (existing.role === "ADMIN") {
        const adminCount = await tx.projectMember.count({
          where: { projectId, role: "ADMIN" },
        });
        if (adminCount <= 1) return { status: "last-admin" as const };
      }

      await tx.projectMember.delete({ where: { id: memberId } });
      return { status: "deleted" as const, member: existing };
    }, { isolationLevel: "Serializable" });

    if (result.status === "not-found") {
      return jsonError("NOT_FOUND", "项目成员不存在", 404);
    }
    if (result.status === "last-admin") {
      return jsonError("CONFLICT", "项目必须保留至少一名项目管理员", 409);
    }

    await writeAuditLog({
      userId: auth.userId,
      action: "DELETE",
      entityType: "member",
      entityId: memberId,
      changes: {
        projectId,
        memberUserId: result.member.userId,
        role: result.member.role,
      },
    });
    return NextResponse.json({ deleted: true });
  } catch {
    return internalError("移除项目成员失败");
  }
}
