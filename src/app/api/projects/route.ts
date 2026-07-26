import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { validateRequired } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentOrganization } from "@/lib/organizations";
import type { ProjectRole } from "@/generated/prisma/enums";
import type { ProjectDTO, ProjectWithStats, ProjectsResponse } from "@/types";

export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = request.nextUrl;
    const includeArchived = searchParams.get("includeArchived") === "true";
    const organization = await getCurrentOrganization(
      prisma,
      request,
      authResult.userId,
    );
    if (!organization) {
      return NextResponse.json<ProjectsResponse>({ projects: [] });
    }

    const user = await prisma.user.findUnique({
      where: { id: authResult.userId },
      select: { role: true },
    });
    if (!user) return jsonError("UNAUTHORIZED", "用户不存在", 401);

    const where: Record<string, unknown> = {
      organizationId: organization.id,
    };
    if (!includeArchived) where.archived = false;
    if (organization.role === "MEMBER") {
      where.members = { some: { userId: authResult.userId } };
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          where: { userId: authResult.userId },
          select: { role: true },
          take: 1,
        },
        _count: {
          select: { stages: true, cases: true },
        },
      },
    });

    const [passCounts, failCounts] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["projectId"],
        where: {
          resultSummary: "PASS",
          project: { organizationId: organization.id },
        },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["projectId"],
        where: {
          resultSummary: "FAIL",
          project: { organizationId: organization.id },
        },
        _count: { _all: true },
      }),
    ]);

    const passMap = new Map(passCounts.map((r) => [r.projectId, r._count._all]));
    const failMap = new Map(failCounts.map((r) => [r.projectId, r._count._all]));

    const projectsWithStats: ProjectWithStats[] = projects.map((p) => {
      const projectRole = (p.members?.[0]?.role ?? null) as ProjectRole | null;
      const organizationAdmin =
        organization.role === "OWNER" || organization.role === "ADMIN";
      return {
      id: p.id,
      organizationId: p.organizationId,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      archived: p.archived,
      stageCount: p._count.stages,
      caseCount: p._count.cases,
      passCount: passMap.get(p.id) ?? 0,
      failCount: failMap.get(p.id) ?? 0,
      projectRole,
      canView: organizationAdmin || projectRole !== null,
      canEdit: organizationAdmin || projectRole === "ADMIN" || projectRole === "EDITOR",
      canAdmin: organizationAdmin || projectRole === "ADMIN",
      };
    });

    return NextResponse.json<ProjectsResponse>({ projects: projectsWithStats });
  } catch {
    return internalError("获取项目列表失败");
  }
}

export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN", "EDITOR"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const organization = await getCurrentOrganization(
      prisma,
      request,
      authResult.userId,
    );
    if (!organization) {
      return jsonError("NO_ORGANIZATION", "请先创建或加入一个组织", 409);
    }
    const body = await request.json();
    const { name } = body;

    const nameError = validateRequired(name, "项目名称");
    if (nameError) {
      return jsonError("VALIDATION_ERROR", nameError);
    }

    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        name: name.trim(),
        members: {
          create: { userId: authResult.userId, role: "ADMIN" },
        },
      },
    });

    const projectDTO: ProjectDTO = {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      archived: project.archived,
      projectRole: "ADMIN",
      canView: true,
      canEdit: true,
      canAdmin: true,
    };

    await writeAuditLog({
      userId: authResult.userId,
      action: "CREATE",
      entityType: "project",
      entityId: project.id,
      changes: { name: project.name, organizationId: organization.id },
    });

    return NextResponse.json({ project: projectDTO }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "当前组织中已存在同名项目", 409);
    }
    return internalError("创建项目失败");
  }
}
