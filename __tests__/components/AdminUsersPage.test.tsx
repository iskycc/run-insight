/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminUsersPage from '@/app/admin/users/page';
import { ApiError } from '@/lib/fetch';

const mockFetchJson = jest.fn();
const mockShowToast = jest.fn();
const mockUpdateCurrentUser = jest.fn();
const mockUseAuth = jest.fn(() => ({
  user: { id: 'u1', username: 'admin' },
  isLoading: false,
  updateCurrentUser: mockUpdateCurrentUser,
}));

jest.mock('@/lib/fetch', () => {
  const actual = jest.requireActual('@/lib/fetch');
  return {
    ...actual,
    fetchJson: (...args: unknown[]) => mockFetchJson(...args),
  };
});

jest.mock('@/components/shared/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast, hideToast: jest.fn(), toasts: [] }),
}));

describe('AdminUsersPage', () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
    mockShowToast.mockReset();
    mockUpdateCurrentUser.mockReset();
  });

  it('renders users for ADMIN', async () => {
    mockFetchJson.mockResolvedValueOnce({
      users: [
        { id: 'u1', username: 'admin', role: 'ADMIN', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        { id: 'u2', username: 'editor', role: 'EDITOR', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
      ],
    });

    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.getAllByText('本地')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '新建用户' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改 admin 的用户名' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重置 admin 的密码' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重置 editor 的密码' })).toBeInTheDocument();
  });

  it('shows denial message for non-admin (403)', async () => {
    mockFetchJson.mockRejectedValueOnce(
      new ApiError(403, 'FORBIDDEN', '权限不足'),
    );

    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText('权限不足，仅管理员可访问')).toBeInTheDocument();
    });
  });

  it('resets a user password after confirming it', async () => {
    mockFetchJson
      .mockResolvedValueOnce({
        users: [
          { id: 'u1', username: 'admin', role: 'ADMIN', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
          { id: 'u2', username: 'editor', role: 'EDITOR', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        ],
      })
      .mockResolvedValueOnce({ success: true });

    render(<AdminUsersPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('editor')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '重置 editor 的密码' }));
    expect(screen.getByRole('dialog', { name: '重置密码' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('新密码'), 'replacement-password');
    await user.type(screen.getByLabelText('确认新密码'), 'replacement-password');
    await user.click(screen.getByRole('button', { name: '确认重置' }));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenLastCalledWith('/api/users/u2/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: 'replacement-password' }),
        reloadOnUnauthorized: false,
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      message: '已重置 editor 的密码',
      type: 'success',
    });
    expect(screen.queryByRole('dialog', { name: '重置密码' })).not.toBeInTheDocument();
  });

  it('reports forbidden password resets without revealing the submitted password', async () => {
    mockFetchJson
      .mockResolvedValueOnce({
        users: [
          { id: 'u1', username: 'admin', role: 'ADMIN', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
          { id: 'u2', username: 'editor', role: 'EDITOR', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        ],
      })
      .mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', '权限不足'));

    render(<AdminUsersPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('editor')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '重置 editor 的密码' }));
    await user.type(screen.getByLabelText('新密码'), 'replacement-password');
    await user.type(screen.getByLabelText('确认新密码'), 'replacement-password');
    await user.click(screen.getByRole('button', { name: '确认重置' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('权限不足，仅管理员可重置密码');
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      message: '权限不足，仅管理员可重置密码',
      type: 'error',
    });
    expect(screen.queryByText('replacement-password')).not.toBeInTheDocument();
  });

  it('changes the current administrator username from the console', async () => {
    mockFetchJson
      .mockResolvedValueOnce({
        users: [
          { id: 'u1', username: 'admin', role: 'ADMIN', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        ],
      })
      .mockResolvedValueOnce({
        id: 'u1',
        username: 'super-admin',
        role: 'ADMIN',
        authSource: 'LOCAL',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      })
      .mockResolvedValueOnce({
        users: [
          { id: 'u1', username: 'super-admin', role: 'ADMIN', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-02T00:00:00Z' },
        ],
      });

    render(<AdminUsersPage />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '修改 admin 的用户名' }));
    const input = screen.getByLabelText('新用户名');
    await user.clear(input);
    await user.type(input, 'super-admin');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith('/api/users/u1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'super-admin' }),
      });
    });
    expect(mockUpdateCurrentUser).toHaveBeenCalledWith({
      username: 'super-admin',
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      message: '用户名已更新',
      type: 'success',
    });
  });

  it('marks LDAP users as directory-managed and hides local credential actions', async () => {
    mockFetchJson.mockResolvedValueOnce({
      users: [
        { id: 'u1', username: 'admin', role: 'ADMIN', authSource: 'LOCAL', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        { id: 'u3', username: 'ldap-user', role: 'EDITOR', authSource: 'LDAP', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
      ],
    });

    render(<AdminUsersPage />);

    await waitFor(() => expect(screen.getByText('ldap-user')).toBeInTheDocument());
    expect(screen.getByText('LDAP')).toBeInTheDocument();
    expect(screen.getByText('目录管理')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '修改 ldap-user 的用户名' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '重置 ldap-user 的密码' }),
    ).not.toBeInTheDocument();
  });
});
