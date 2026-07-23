import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { internalError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const projectId = searchParams.get('projectId');
    const testStageId = searchParams.get('testStageId');
    const batchScopeId = searchParams.get('batchScopeId');
    const progressCategory = searchParams.get('progressCategory');
    const assignee = searchParams.get('assignee');
    const rootCause = searchParams.get('rootCause');

    // 构建筛选条件
    const where: Record<string, unknown> = { assetSaved: true };

    if (projectId) where.projectId = projectId;
    if (testStageId) where.testStageId = testStageId;
    if (batchScopeId) where.batchScopeId = batchScopeId;
    if (progressCategory) where.progressCategory = progressCategory;
    if (assignee) where.assignee = assignee;
    if (rootCause) where.rootCause = { contains: rootCause };

    const [assets, total] = await Promise.all([
      prisma.caseResult.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true } },
          batchScope: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.caseResult.count({ where }),
    ]);

    // 序列化日期字段
    const serialized = assets.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));

    return NextResponse.json({ assets: serialized, total, page, pageSize });
  } catch {
    return internalError("获取资产列表失败");
  }
}
