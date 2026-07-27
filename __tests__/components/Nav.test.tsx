/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('makes project, history, report and admin areas discoverable for administrators', async () => {
    const user = userEvent.setup();
    renderNav({ id: 'u-1', username: 'admin', role: 'ADMIN' });

    await waitFor(() => expect(screen.getByRole('link', { name: '项目' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '大盘' })).toHaveAttribute('href', '/');
    await user.click(screen.getByRole('button', { name: /更多/ }));
    expect(screen.getByRole('menuitem', { name: '责任人报告' })).toHaveAttribute(
      'href',
      '/reports/assignee'
    );
    expect(screen.getByRole('menuitem', { name: '导入历史' })).toHaveAttribute(
      'href',
      '/import-history'
    );
    expect(screen.getByRole('menuitem', { name: '平台管理' })).toHaveAttribute(
      'href',
      '/admin/users'
    );
    expect(screen.getByRole('link', { name: '项目' })).toHaveAttribute('aria-current', 'page');
  });

  it('hides mutating and administrative entries for viewers', async () => {
    const user = userEvent.setup();
    renderNav({ id: 'u-2', username: 'viewer', role: 'VIEWER' });

    await waitFor(() => expect(screen.getByRole('link', { name: '项目' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: '导入' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /更多/ }));
    expect(screen.getByRole('menuitem', { name: '导入历史' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '责任人报告' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '平台管理' })).not.toBeInTheDocument();
  });

  it('hides navigation for guests because the dashboard is the default page', async () => {
    renderNav(null);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '大盘' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '项目' })).not.toBeInTheDocument();
  });
});
