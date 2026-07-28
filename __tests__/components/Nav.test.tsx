/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { Nav } from '@/components/layout/Nav';
import { AuthProvider } from '@/components/shared/AuthProvider';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

const mockedUsePathname = usePathname as jest.Mock;
const originalFetch = globalThis.fetch;

function renderNav(user: { id: string; username: string; role: string } | null) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ user }),
  } as Response);
  return render(
    <AuthProvider>
      <Nav />
    </AuthProvider>
  );
}

describe('Nav', () => {
  beforeEach(() => mockedUsePathname.mockReturnValue('/projects/project-1'));

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('uses one platform entry instead of a more menu for administrators', async () => {
    renderNav({ id: 'u-1', username: 'admin', role: 'ADMIN' });

    await waitFor(() => expect(screen.getByRole('link', { name: '项目' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '大盘' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '平台管理' })).toHaveAttribute(
      'href',
      '/admin/users'
    );
    expect(screen.queryByRole('button', { name: /更多/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '责任人报告' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '导入历史' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '项目' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps reporting available to viewers through the platform entry', async () => {
    renderNav({ id: 'u-2', username: 'viewer', role: 'VIEWER' });

    await waitFor(() => expect(screen.getByRole('link', { name: '项目' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: '导入' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '平台管理' })).toHaveAttribute(
      'href',
      '/reports/assignee',
    );
    expect(screen.queryByRole('button', { name: /更多/ })).not.toBeInTheDocument();
  });

  it('marks platform management active on merged report routes', async () => {
    mockedUsePathname.mockReturnValue('/import-history/record-1');
    renderNav({ id: 'u-2', username: 'viewer', role: 'VIEWER' });

    expect(
      await screen.findByRole('link', { name: '平台管理' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('hides navigation for guests because the dashboard is the default page', async () => {
    renderNav(null);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '大盘' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '项目' })).not.toBeInTheDocument();
  });
});
