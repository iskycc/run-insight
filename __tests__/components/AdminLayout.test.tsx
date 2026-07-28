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
  useAuth: () => ({ user: { id: 'u1', username: 'admin' }, isLoading: false }),
}));

describe('AdminLayout', () => {
  it('renders admin shell with Users and Audit Logs links', () => {
    render(
      <AdminLayout>
        <div>child-content</div>
      </AdminLayout>,
    );

    const adminTabs = screen.getByText('平台管理').closest('header');
    expect(adminTabs).toHaveClass('xl:w-[calc(100%-2.5rem)]', 'xl:max-w-[1280px]');
    const navigation = screen.getByRole('navigation', { name: '平台管理导航' });
    expect(navigation).toHaveClass('flex', 'w-full', 'sm:w-auto');
    expect(screen.getByRole('link', { name: '用户管理' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'LDAP 配置' })).toHaveAttribute('href', '/admin/ldap');
    expect(screen.getByRole('link', { name: '用户管理' })).toHaveClass(
      'min-w-0',
      'flex-1',
      'flex-col',
      'text-xs',
      'sm:flex-none',
      'sm:flex-row',
      'sm:text-sm',
    );
    expect(screen.getByRole('link', { name: '审计日志' })).toHaveAttribute('href', '/admin/audit-logs');
    expect(screen.getByText('child-content')).toBeInTheDocument();
  });
});
