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
    const navigation = screen.getByRole('navigation');
    expect(navigation).toHaveClass('grid', 'w-full', 'grid-cols-3', 'sm:flex', 'sm:w-auto');
    expect(screen.getByRole('link', { name: '用户管理' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: '用户管理' })).toHaveClass(
      'min-w-0',
      'flex-col',
      'text-xs',
      'sm:flex-row',
      'sm:text-sm',
    );
    expect(screen.getByRole('link', { name: '审计日志' })).toHaveAttribute('href', '/admin/audit-logs');
    expect(screen.getByText('child-content')).toBeInTheDocument();
  });
});
