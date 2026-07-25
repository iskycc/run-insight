import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { validateRequired } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import type { BatchScopeDTO, BatchScopeWithStats, BatchesResponse } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    const stage = await prisma.testStage.findUnique({ where: { id } });
    if (!stage) {
      return jsonError("NOT_FOUND", "阶段不存在", 404);
    }
    const access = await getProjectAccess(prisma, authResult.userId, stage.projectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权访问该阶段", 403);

    const { searchParams } = request.nextUrl;
    const includeArchived = searchParams.get("includeArchived") === "true";

    const where: Record<string, unknown> = { testStageId: id };
    if (!includeArchived) where.archived = false;

    const batches = await prisma.batchScope.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { cases: true },
        },
      },
    });

    const [passCounts, failCounts] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batches.map((b) => b.id) }, resultSummary: "PASS" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batches.map((b) => b.id) }, resultSummary: "FAIL" },
        _count: { _all: true },
      }),
    ]);

    const passMap = new Map(passCounts.map((r) => [r.batchScopeId, r._count._all]));
    const failMap = new Map(failCounts.map((r) => [r.batchScopeId, r._count._all]));

    const batchesWithStats: BatchScopeWithStats[] = batches.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      testStageId: b.testStageId,
      name: b.name,
      archived: b.archived,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      caseCount: b._count.cases,
      passCount: passMap.get(b.id) ?? 0,
      failCount: failMap.get(b.id) ?? 0,
    }));

    return NextResponse.json<BatchesResponse>({ batches: batchesWithStats });
  } catch {
    return internalError("获取批跑列表失败");
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

    const stage = await prisma.testStage.findUnique({ where: { id } });
    if (!stage) {
      return jsonError("NOT_FOUND", "阶段不存在", 404);
    }
    const access = await getProjectAccess(prisma, authResult.userId, stage.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权编辑该阶段", 403);

    const body = await request.json();
    const { name } = body;

    const nameError = validateRequired(name, "批跑名称");
    if (nameError) {
      return jsonError("VALIDATION_ERROR", nameError);
    }

    const batch = await prisma.batchScope.create({
      data: {
        name: name.trim(),
        projectId: stage.projectId,
        testStageId: id,
      },
    });

    const batchDTO: BatchScopeDTO = {
      id: batch.id,
      projectId: batch.projectId,
      testStageId: batch.testStageId,
      name: batch.name,
      archived: batch.archived,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };

    await writeAuditLog({
      userId: authResult.userId,
      action: "CREATE",
      entityType: "batch",
      entityId: batch.id,
      changes: { name: batch.name, projectId: batch.projectId, testStageId: id },
    });

    return NextResponse.json({ batch: batchDTO }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "该批跑名称已存在", 409);
    }
    return internalError("创建批跑失败");
  }
}
