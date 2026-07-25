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
    expect(screen.getByRole('link', { name: '查看用例' })).toHaveAttribute(
      'href',
      '/workspace?projectId=project-1&testStageId=stage-1&batchScopeId=batch-1'
    );
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
});
