import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import { isValidProjectRole } from "@/lib/validations";
import type { ProjectMembersResponse } from "@/types";

function serializeMember(member: {
  id: string;
  projectId: string;
  userId: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  createdAt: Date;
  user: { username: string; role: "ADMIN" | "EDITOR" | "VIEWER" };
}) {
  return {
    id: member.id,
    projectId: member.projectId,
    userId: member.userId,
    username: member.user.username,
    systemRole: member.user.role,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);

    const access = await getProjectAccess(prisma, auth.userId, projectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权访问该项目", 403);

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { username: true, role: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json<ProjectMembersResponse>({
      members: members.map(serializeMember),
      canManage: access.canAdmin,
    });
  } catch {
    return internalError("获取项目成员失败");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });
    if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
    const access = await getProjectAccess(prisma, auth.userId, projectId);
    if (!access?.canAdmin) return jsonError("FORBIDDEN", "只有项目管理员可以管理成员", 403);

    const body: { userId?: unknown; username?: unknown; role?: unknown } = await request.json();
    if (!isValidProjectRole(body.role)) {
      return jsonError("VALIDATION_ERROR", "项目角色不合法");
    }
    if (
      (typeof body.userId !== "string" || !body.userId) &&
      (typeof body.username !== "string" || !body.username.trim())
    ) {
      return jsonError("VALIDATION_ERROR", "请选择用户");
    }

    const user = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId as string } })
      : await prisma.user.findUnique({ where: { username: (body.username as string).trim() } });
    if (!user) return jsonError("NOT_FOUND", "用户不存在", 404);
    const organizationMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: project.organizationId,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (!organizationMembership) {
      return jsonError("VALIDATION_ERROR", "用户必须先加入项目所属组织");
    }

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (existing) return jsonError("CONFLICT", "用户已是项目成员", 409);

    const member = await prisma.projectMember.create({
      data: { projectId, userId: user.id, role: body.role },
      include: { user: { select: { username: true, role: true } } },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "CREATE",
      entityType: "member",
      entityId: member.id,
      changes: {
        projectId,
        memberUserId: member.userId,
        role: member.role,
      },
    });
    return NextResponse.json({ member: serializeMember(member) }, { status: 201 });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return jsonError("CONFLICT", "用户已是项目成员", 409);
    }
    return internalError("添加项目成员失败");
  }
}
