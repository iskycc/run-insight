import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { internalError, jsonError } from '@/lib/api-helpers';
import { getProjectAccess } from '@/lib/project-access';
import { prisma } from '@/lib/prisma';
import type { BatchResultsSummaryResponse, ResultSummary } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const batch = await prisma.batchScope.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });
    if (!batch) return jsonError('NOT_FOUND', '批跑不存在', 404);

    const access = await getProjectAccess(
      prisma,
      authResult.userId,
      batch.projectId,
    );
    if (!access?.canView) {
      return jsonError('FORBIDDEN', '无权查看该批跑结果', 403);
    }

    const groups = await prisma.caseResult.groupBy({
      by: ['resultSummary'],
      where: { batchScopeId: id },
      _count: { _all: true },
    });
    const counts = new Map(
      groups.map((group) => [
        group.resultSummary as ResultSummary,
        group._count._all,
      ]),
    );
    const count = (result: ResultSummary) => counts.get(result) ?? 0;
    const passCount = count('PASS');
    const failCount = count('FAIL');
    const blockCount = count('BLOCK');
    const skipCount = count('SKIP');
    const totalCount = groups.reduce(
      (total, group) => total + group._count._all,
      0,
    );

    return NextResponse.json<BatchResultsSummaryResponse>({
      batch: {
        id: batch.id,
        projectId: batch.projectId,
        testStageId: batch.testStageId,
        name: batch.name,
        archived: batch.archived,
        executedAt: batch.executedAt.toISOString(),
        startedAt: batch.startedAt?.toISOString() ?? null,
        finishedAt: batch.finishedAt?.toISOString() ?? null,
        environment: batch.environment,
        buildVersion: batch.buildVersion,
        commitSha: batch.commitSha,
        pipelineUrl: batch.pipelineUrl,
        createdAt: batch.createdAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
        project: batch.project,
        stage: batch.stage,
      },
      stats: {
        totalCount,
        passCount,
        failCount,
        blockCount,
        skipCount,
        nonPassCount: Math.max(0, totalCount - passCount),
        passRate: totalCount > 0
          ? Number(((passCount / totalCount) * 100).toFixed(1))
          : 0,
      },
      canEdit: access.canEdit && !batch.archived,
    });
  } catch (error) {
    return internalError('获取批跑结果统计失败', {
      request,
      error,
      event: 'batch.results_summary_failed',
      context: { userId: authResult.userId },
    });
  }
}
