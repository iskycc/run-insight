import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { validateRequired } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { TestStageDTO, TestStageWithStats, StagesResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return jsonError("NOT_FOUND", "项目不存在", 404);
    }

    const stages = await prisma.testStage.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { batches: true, cases: true },
        },
      },
    });

    const [passCounts, failCounts] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["testStageId"],
        where: { testStageId: { in: stages.map((s) => s.id) }, resultSummary: "PASS" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["testStageId"],
        where: { testStageId: { in: stages.map((s) => s.id) }, resultSummary: "FAIL" },
        _count: { _all: true },
      }),
    ]);

    const passMap = new Map(passCounts.map((r) => [r.testStageId, r._count._all]));
    const failMap = new Map(failCounts.map((r) => [r.testStageId, r._count._all]));

    const stagesWithStats: TestStageWithStats[] = stages.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      name: s.name,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      batchCount: s._count.batches,
      caseCount: s._count.cases,
      passCount: passMap.get(s.id) ?? 0,
      failCount: failMap.get(s.id) ?? 0,
    }));

    return NextResponse.json<StagesResponse>({ stages: stagesWithStats });
  } catch {
    return internalError("获取阶段列表失败");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return jsonError("NOT_FOUND", "项目不存在", 404);
    }

    const body = await request.json();
    const { name } = body;

    const nameError = validateRequired(name, "阶段名称");
    if (nameError) {
      return jsonError("VALIDATION_ERROR", nameError);
    }

    const stage = await prisma.testStage.create({
      data: {
        name: name.trim(),
        projectId: id,
      },
    });

    const stageDTO: TestStageDTO = {
      id: stage.id,
      projectId: stage.projectId,
      name: stage.name,
      createdAt: stage.createdAt.toISOString(),
      updatedAt: stage.updatedAt.toISOString(),
    };

    return NextResponse.json({ stage: stageDTO }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "该阶段名称已存在", 409);
    }
    return internalError("创建阶段失败");
  }
}
