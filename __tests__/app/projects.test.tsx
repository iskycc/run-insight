/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import ProjectsPage from '@/app/projects/page';
import { AuthProvider } from '@/components/shared/AuthProvider';
import { ToastProvider } from '@/contexts/ToastContext';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.Mock;
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
        <ProjectsPage />
      </AuthProvider>
    </ToastProvider>
  );
}

const archivedProject = {
  id: 'project-trash',
  name: '归档项目',
  archived: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  stageCount: 1,
  caseCount: 10,
  passCount: 8,
  failCount: 2,
  canView: true,
  canEdit: true,
  canAdmin: true,
  projectRole: 'ADMIN',
};

describe('ProjectsPage recycle bin', () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({ push: jest.fn() });
    window.confirm = jest.fn(() => true);
    window.prompt = jest.fn(() => null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('filters to archived projects and restores one', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return response({ user: { id: 'u-1', username: 'admin', role: 'ADMIN' } });
      }
      if (url === '/api/projects?includeArchived=false') {
        return response({ projects: [] });
      }
      if (url === '/api/projects?includeArchived=true') {
        return response({ projects: [archivedProject] });
      }
      if (url === '/api/projects/project-trash' && init?.method === 'PATCH') {
        return response({ ...archivedProject, archived: false });
      }
      return response({}, false, 404);
    });
    globalThis.fetch = fetchMock as jest.Mock;

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '回收站' }));
    expect(await screen.findByText('归档项目')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('管理项目 归档项目'));
    fireEvent.click(screen.getByRole('button', { name: '恢复项目' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-trash',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ archived: false }),
        })
      );
    });
  });

  it('requires exact name confirmation before permanent deletion', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/me') {
        return response({ user: { id: 'u-1', username: 'admin', role: 'ADMIN' } });
      }
      if (url === '/api/projects?includeArchived=false') {
        return response({ projects: [] });
      }
      if (url === '/api/projects?includeArchived=true') {
        return response({ projects: [archivedProject] });
      }
      return response({});
    });
    globalThis.fetch = fetchMock as jest.Mock;
    (window.prompt as jest.Mock).mockReturnValue('错误名称');

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '回收站' }));
    await screen.findByText('归档项目');
    fireEvent.click(screen.getByLabelText('管理项目 归档项目'));
    fireEvent.click(screen.getByRole('button', { name: '永久删除' }));

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('级联删除')
    );
    expect(window.prompt).toHaveBeenCalledWith(
      expect.stringContaining('归档项目')
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/projects/project-trash?permanent=true',
      expect.anything()
    );

    (window.prompt as jest.Mock).mockReturnValue('归档项目');
    fireEvent.click(screen.getByRole('button', { name: '永久删除' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-trash?permanent=true',
        { method: 'DELETE' }
      );
    });
  });
});
