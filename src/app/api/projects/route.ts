import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { validateRequired } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import type { ProjectDTO, ProjectWithStats, ProjectsResponse } from "@/types";

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = request.nextUrl;
    const includeArchived = searchParams.get("includeArchived") === "true";

    const where: Record<string, unknown> = {};
    if (!includeArchived) where.archived = false;

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { stages: true, cases: true },
        },
      },
    });

    const [passCounts, failCounts] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["projectId"],
        where: { resultSummary: "PASS" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["projectId"],
        where: { resultSummary: "FAIL" },
        _count: { _all: true },
      }),
    ]);

    const passMap = new Map(passCounts.map((r) => [r.projectId, r._count._all]));
    const failMap = new Map(failCounts.map((r) => [r.projectId, r._count._all]));

    const projectsWithStats: ProjectWithStats[] = projects.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      archived: p.archived,
      stageCount: p._count.stages,
      caseCount: p._count.cases,
      passCount: passMap.get(p.id) ?? 0,
      failCount: failMap.get(p.id) ?? 0,
    }));

    return NextResponse.json<ProjectsResponse>({ projects: projectsWithStats });
  } catch {
    return internalError("获取项目列表失败");
  }
}

export async function POST(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN", "EDITOR"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const body = await request.json();
    const { name } = body;

    const nameError = validateRequired(name, "项目名称");
    if (nameError) {
      return jsonError("VALIDATION_ERROR", nameError);
    }

    const project = await prisma.project.create({
      data: { name: name.trim() },
    });

    const projectDTO: ProjectDTO = {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      archived: project.archived,
    };

    await writeAuditLog({
      userId: authResult.userId,
      action: "CREATE",
      entityType: "project",
      entityId: project.id,
      changes: { name: project.name },
    });

    return NextResponse.json({ project: projectDTO }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "项目名称已存在", 409);
    }
    return internalError("创建项目失败");
  }
}
