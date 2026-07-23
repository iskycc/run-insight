import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { validateRequired } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
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

    const batches = await prisma.batchScope.findMany({
      where: { testStageId: id },
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
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };

    return NextResponse.json({ batch: batchDTO }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "该批跑名称已存在", 409);
    }
    return internalError("创建批跑失败");
  }
}
