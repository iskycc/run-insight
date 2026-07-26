import { NextRequest, NextResponse } from "next/server";
import type { OrganizationRole } from "@/generated/prisma/enums";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError, parseJsonObject } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { canManageOrganization } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

const ROLES = new Set<OrganizationRole>(["OWNER", "ADMIN", "MEMBER"]);

function serialize(member: {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: Date;
  user: { username: string };
}) {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    username: member.user.username,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}
async function actorMembership(organizationId: string, userId: string) {
  return prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: organizationId } = await params;
    const actor = await actorMembership(organizationId, auth.userId);
    if (!actor) return jsonError("NOT_FOUND", "组织不存在或无权访问", 404);

    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { username: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      members: members.map(serialize),
      canManage: canManageOrganization(actor.role),
      actorRole: actor.role,
    });
  } catch (error) {
    return internalError("获取组织成员失败", {
      request,
      error,
      event: "organization_member.list_failed",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: organizationId } = await params;
    const actor = await actorMembership(organizationId, auth.userId);
    if (!actor) return jsonError("NOT_FOUND", "组织不存在或无权访问", 404);
    if (!canManageOrganization(actor.role)) {
      return jsonError("FORBIDDEN", "只有组织所有者或管理员可以管理成员", 403);
    }

    const parsed = await parseJsonObject(request, ["userId", "username", "role"]);
    if (!parsed.ok) return parsed.response;
    const role = parsed.value.role;
    if (typeof role !== "string" || !ROLES.has(role as OrganizationRole)) {
      return jsonError("VALIDATION_ERROR", "组织角色不合法");
    }
    if (actor.role !== "OWNER" && role === "OWNER") {
      return jsonError("FORBIDDEN", "只有组织所有者可以授予所有者角色", 403);
    }
    const userId =
      typeof parsed.value.userId === "string" ? parsed.value.userId : null;
    const username =
      typeof parsed.value.username === "string"
        ? parsed.value.username.trim()
        : null;
    if (!userId && !username) return jsonError("VALIDATION_ERROR", "请选择用户");

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      : await prisma.user.findUnique({
          where: { username: username! },
          select: { id: true },
        });
    if (!user) return jsonError("NOT_FOUND", "用户不存在", 404);

    const member = await prisma.organizationMember.create({
      data: { organizationId, userId: user.id, role: role as OrganizationRole },
      include: { user: { select: { username: true } } },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "CREATE",
      entityType: "organizationMember",
      entityId: member.id,
      changes: { organizationId, memberUserId: member.userId, role: member.role },
    });
    return NextResponse.json({ member: serialize(member) }, { status: 201 });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return jsonError("CONFLICT", "用户已是组织成员", 409);
    }
    return internalError("添加组织成员失败", {
      request,
      error,
      event: "organization_member.create_failed",
    });
  }
}
