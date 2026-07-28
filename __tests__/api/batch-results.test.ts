import { GET } from '@/app/api/batches/[id]/results/route';
import { generateToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
    projectMember: { findUnique: jest.fn() },
    batchScope: { findUnique: jest.fn() },
    caseResult: { groupBy: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function request(authenticated = true) {
  const req = new NextRequest('http://localhost:3000/api/batches/b1/results');
  if (authenticated) {
    req.headers.set(
      'cookie',
      `run_insight_token=${generateToken({ userId: 'user_1', username: 'admin' })}`,
    );
  }
  return req;
}

const batch = {
  id: 'b1',
  projectId: 'p1',
  testStageId: 's1',
  name: 'Release 3.0',
  archived: false,
  executedAt: new Date('2026-07-28T02:00:00.000Z'),
  startedAt: new Date('2026-07-28T01:30:00.000Z'),
  finishedAt: new Date('2026-07-28T02:30:00.000Z'),
  environment: 'UAT',
  buildVersion: '3.0.0',
  commitSha: 'abcdef',
  pipelineUrl: 'https://ci.example.com/1',
  createdAt: new Date('2026-07-28T01:00:00.000Z'),
  updatedAt: new Date('2026-07-28T02:30:00.000Z'),
  project: { id: 'p1', name: '支付平台' },
  stage: { id: 's1', name: '回归测试' },
};

describe('GET /api/batches/[id]/results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: 'ADMIN' });
  });

  it('requires authentication', async () => {
    const res = await GET(request(false), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown batch', async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await GET(request(), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
  });

  it('returns batch metadata, complete result counts and edit permission', async () => {
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue(batch);
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([
      { resultSummary: 'PASS', _count: { _all: 80 } },
      { resultSummary: 'FAIL', _count: { _all: 12 } },
      { resultSummary: 'BLOCK', _count: { _all: 5 } },
      { resultSummary: 'SKIP', _count: { _all: 3 } },
    ]);

    const res = await GET(request(), { params: Promise.resolve({ id: 'b1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.batch).toEqual(expect.objectContaining({
      id: 'b1',
      project: { id: 'p1', name: '支付平台' },
      stage: { id: 's1', name: '回归测试' },
      executedAt: '2026-07-28T02:00:00.000Z',
    }));
    expect(body.stats).toEqual({
      totalCount: 100,
      passCount: 80,
      failCount: 12,
      blockCount: 5,
      skipCount: 3,
      nonPassCount: 20,
      passRate: 80,
    });
    expect(body.canEdit).toBe(true);
  });

  it('allows a project viewer to read but not edit', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: 'VIEWER' });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({ role: 'VIEWER' });
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue(batch);
    (mockPrisma.caseResult.groupBy as jest.Mock).mockResolvedValue([]);

    const res = await GET(request(), { params: Promise.resolve({ id: 'b1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.canEdit).toBe(false);
  });

  it('denies users outside the project', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: 'VIEWER' });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.batchScope.findUnique as jest.Mock).mockResolvedValue(batch);

    const res = await GET(request(), { params: Promise.resolve({ id: 'b1' }) });

    expect(res.status).toBe(403);
    expect(mockPrisma.caseResult.groupBy).not.toHaveBeenCalled();
  });
});
