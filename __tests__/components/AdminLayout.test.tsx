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

    expect(screen.getByText('系统管理')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '用户管理' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: '审计日志' })).toHaveAttribute('href', '/admin/audit-logs');
    expect(screen.getByText('child-content')).toBeInTheDocument();
  });
});