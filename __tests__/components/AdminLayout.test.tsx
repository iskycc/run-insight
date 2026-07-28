/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import AdminLayout from '@/app/admin/layout';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/users',
}));

jest.mock('@/components/shared/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'admin', role: 'ADMIN' },
    isLoading: false,
  }),
}));

describe('AdminLayout', () => {
  it('renders one platform shell with admin, report and history links', () => {
    render(
      <AdminLayout>
        <div>child-content</div>
      </AdminLayout>,
    );

    const adminTabs = screen.getByText('平台管理').closest('header');
    expect(adminTabs).toHaveClass('xl:w-[calc(100%-2.5rem)]', 'xl:max-w-[1280px]');
    const navigation = screen.getByRole('navigation', { name: '平台管理导航' });
    expect(navigation).toHaveClass('flex', 'w-full', 'overflow-x-auto', 'sm:w-auto');
    expect(screen.getByRole('link', { name: '用户管理' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'LDAP 配置' })).toHaveAttribute('href', '/admin/ldap');
    expect(screen.getByRole('link', { name: '用户管理' })).toHaveClass(
      'min-w-[88px]',
      'flex-none',
      'flex-col',
      'text-xs',
      'sm:min-w-0',
      'sm:flex-row',
      'sm:text-sm',
    );
    expect(screen.getByRole('link', { name: '审计日志' })).toHaveAttribute('href', '/admin/audit-logs');
    expect(screen.getByRole('link', { name: '责任人报告' })).toHaveAttribute(
      'href',
      '/reports/assignee',
    );
    expect(screen.getByRole('link', { name: '导入历史' })).toHaveAttribute(
      'href',
      '/import-history',
    );
    expect(screen.getByText('child-content')).toBeInTheDocument();
  });
});
