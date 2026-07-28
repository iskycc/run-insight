/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useParams } from 'next/navigation';
import ProjectDetailPage from '@/app/projects/[id]/page';
import { AuthProvider } from '@/components/shared/AuthProvider';
import { ToastProvider } from '@/contexts/ToastContext';

jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
}));

const mockedUseParams = useParams as jest.Mock;
const originalFetch = globalThis.fetch;

function response(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => body,
  } as Response);
}

function renderPage() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <ProjectDetailPage />
      </AuthProvider>
    </ToastProvider>
  );
}

const project = {
  id: 'project-1',
  name: '支付平台',
  archived: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  stageCount: 1,
  caseCount: 10,
  passCount: 8,
  failCount: 2,
};

const stage = {
  id: 'stage-1',
  projectId: 'project-1',
  name: '系统测试',
  archived: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  batchCount: 1,
  caseCount: 10,
  passCount: 8,
  failCount: 2,
};

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    mockedUseParams.mockReturnValue({ id: 'project-1' });
    window.confirm = jest.fn(() => true);
    window.prompt = jest.fn(() => null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('renders overview and expands a stage to show batches for an editor', async () => {
    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return response({ user: { id: 'u-1', username: 'editor', role: 'EDITOR' } });
      }
      if (url.startsWith('/api/projects?')) {
        return response({ projects: [{ ...project, canEdit: true, canAdmin: false }] });
      }
      if (url.startsWith('/api/projects/project-1/stages')) return response({ stages: [stage] });
      if (url.startsWith('/api/stages/stage-1/batches')) {
        return response({
          batches: [
            {
              id: 'batch-1',
              projectId: 'project-1',
              testStageId: 'stage-1',
              name: '回归批跑 01',
              archived: false,
              executedAt: '2026-07-01T08:30:00.000Z',
              startedAt: '2026-07-01T08:00:00.000Z',
              finishedAt: '2026-07-01T09:00:00.000Z',
              environment: 'SIT',
              buildVersion: 'v1.2.3',
              commitSha: 'abcdef1234567890',
              pipelineUrl: 'https://ci.example.com/jobs/42',
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-01T00:00:00.000Z',
              caseCount: 10,
              passCount: 8,
              failCount: 2,
            },
          ],
        });
      }
      return response({}, false, 404);
    }) as jest.Mock;

    renderPage();

    expect(await screen.findByRole('heading', { name: '支付平台' })).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建阶段' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开系统测试' }));

    expect(await screen.findByText('回归批跑 01')).toBeInTheDocument();
    expect(screen.getByText(/^2026年7月1日 16:30/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看结果' })).toHaveAttribute(
      'href',
      '/projects/project-1/batches/batch-1'
    );
    expect(
      screen.getByRole('link', { name: '打开 回归批跑 01 的流水线链接（新窗口）' }),
    ).toHaveAttribute('href', 'https://ci.example.com/jobs/42');
    expect(screen.getByText('abcdef123456')).toBeInTheDocument();
    expect(screen.getByText(/开始/)).toBeInTheDocument();
    expect(screen.getByText(/结束/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('keeps the project read-only for viewers', async () => {
    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return response({ user: { id: 'u-2', username: 'viewer', role: 'VIEWER' } });
      }
      if (url.startsWith('/api/projects?')) {
        return response({ projects: [{ ...project, canEdit: false, canAdmin: false }] });
      }
      if (url.startsWith('/api/projects/project-1/stages')) return response({ stages: [stage] });
      return response({}, false, 404);
    }) as jest.Mock;

    renderPage();

    expect(await screen.findByText('系统测试')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建阶段' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建批跑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '项目设置' })).toBeInTheDocument();
  });

  it('creates a stage through the existing stage API', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return response({ user: { id: 'u-1', username: 'admin', role: 'ADMIN' } });
      }
      if (url.startsWith('/api/projects?')) {
        return response({ projects: [{ ...project, canEdit: true, canAdmin: true }] });
      }
      if (url === '/api/projects/project-1/stages' && init?.method === 'POST') {
        return response({ stage: { ...stage, id: 'stage-2', name: '验收测试' } }, true, 201);
      }
      if (url.startsWith('/api/projects/project-1/stages')) return response({ stages: [stage] });
      return response({}, false, 404);
    });
    globalThis.fetch = fetchMock as jest.Mock;

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '新建阶段' }));
    fireEvent.change(screen.getByPlaceholderText('例如：SIT 第一阶段'), {
      target: { value: '验收测试' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建阶段' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/stages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: '验收测试' }),
        })
      );
    });
  });

  it('creates a batch with timezone-normalized start and finish metadata', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return response({ user: { id: 'u-1', username: 'admin', role: 'ADMIN' } });
      }
      if (url.startsWith('/api/projects?')) {
        return response({ projects: [{ ...project, canEdit: true, canAdmin: true }] });
      }
      if (url.startsWith('/api/projects/project-1/stages')) {
        return response({ stages: [stage] });
      }
      if (url === '/api/stages/stage-1/batches' && init?.method === 'POST') {
        return response({ batch: { id: 'batch-2' } }, true, 201);
      }
      if (url.startsWith('/api/stages/stage-1/batches')) {
        return response({ batches: [] });
      }
      return response({}, false, 404);
    });
    globalThis.fetch = fetchMock as jest.Mock;

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '展开系统测试' }));
    fireEvent.click(await screen.findByRole('button', { name: '新建批跑' }));
    fireEvent.change(screen.getByLabelText('批跑名称'), {
      target: { value: '夜间回归' },
    });
    fireEvent.change(screen.getByLabelText('执行时间'), {
      target: { value: '2026-07-26T10:30' },
    });
    fireEvent.change(screen.getByLabelText('开始时间（可选）'), {
      target: { value: '2026-07-26T10:00' },
    });
    fireEvent.change(screen.getByLabelText('结束时间（可选）'), {
      target: { value: '2026-07-26T11:00' },
    });
    fireEvent.change(screen.getByLabelText('执行环境（可选）'), {
      target: { value: ' SIT ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建批跑' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stages/stage-1/batches',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: '夜间回归',
            executedAt: new Date('2026-07-26T10:30').toISOString(),
            startedAt: new Date('2026-07-26T10:00').toISOString(),
            finishedAt: new Date('2026-07-26T11:00').toISOString(),
            environment: 'SIT',
            buildVersion: null,
            commitSha: null,
            pipelineUrl: null,
          }),
        }),
      );
    });
  });

  it('shows archived batches in the recycle view and restores one', async () => {
    const archivedBatch = {
      id: 'batch-trash',
      projectId: 'project-1',
      testStageId: 'stage-1',
      name: '待恢复批跑',
      archived: true,
      executedAt: '2026-07-01T08:30:00.000Z',
      startedAt: null,
      finishedAt: null,
      environment: null,
      buildVersion: null,
      commitSha: null,
      pipelineUrl: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      caseCount: 10,
      passCount: 8,
      failCount: 2,
    };
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return response({ user: { id: 'u-1', username: 'admin', role: 'ADMIN' } });
      }
      if (url.startsWith('/api/projects?')) {
        return response({ projects: [{ ...project, canEdit: true, canAdmin: true }] });
      }
      if (url.startsWith('/api/projects/project-1/stages')) {
        return response({ stages: [stage] });
      }
      if (url === '/api/batches/batch-trash' && init?.method === 'PATCH') {
        return response({ ...archivedBatch, archived: false });
      }
      if (url.startsWith('/api/stages/stage-1/batches')) {
        return response({ batches: [archivedBatch] });
      }
      return response({}, false, 404);
    });
    globalThis.fetch = fetchMock as jest.Mock;

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '含回收站' }));
    fireEvent.click(await screen.findByRole('button', { name: '展开系统测试' }));
    expect(await screen.findByText('待恢复批跑')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('管理批跑 待恢复批跑'));
    fireEvent.click(screen.getByRole('button', { name: '恢复批跑' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/batches/batch-trash',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ archived: false }),
        })
      );
    });
  });

  it('restores an archived stage from the project recycle view', async () => {
    const archivedStage = {
      ...stage,
      id: 'stage-trash',
      name: '待恢复阶段',
      archived: true,
    };
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return response({ user: { id: 'u-1', username: 'admin', role: 'ADMIN' } });
      }
      if (url.startsWith('/api/projects?')) {
        return response({ projects: [{ ...project, canEdit: true, canAdmin: true }] });
      }
      if (url === '/api/stages/stage-trash' && init?.method === 'PATCH') {
        return response({ ...archivedStage, archived: false });
      }
      if (url.startsWith('/api/projects/project-1/stages')) {
        return response({ stages: [archivedStage] });
      }
      return response({}, false, 404);
    });
    globalThis.fetch = fetchMock as jest.Mock;

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '含回收站' }));
    expect(await screen.findByText('待恢复阶段')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('管理阶段 待恢复阶段'));
    fireEvent.click(screen.getByRole('button', { name: '恢复阶段' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stages/stage-trash',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ archived: false }),
        })
      );
    });
  });
});
