/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/layout/Header';
import { ApiError } from '@/lib/fetch';

const mockFetchJson = jest.fn();
const mockShowToast = jest.fn();
const mockLogout = jest.fn();
const mockLogin = jest.fn();
const mockUseAuth = jest.fn();

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

describe('Header password management', () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
    mockShowToast.mockReset();
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockLogin.mockReset();
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', username: 'admin', role: 'ADMIN' },
      isLoading: false,
      login: mockLogin,
      logout: mockLogout,
    });
  });

  async function openChangePassword() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /admin/ }));
    expect(screen.getByRole('menu', { name: '用户菜单' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: '修改密码' }));
    expect(screen.getByRole('dialog', { name: '修改密码' })).toBeInTheDocument();
    return user;
  }

  it('routes unauthenticated users through the login page', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      logout: mockLogout,
    });

    render(<Header />);

    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('places the clearly named organization settings entry in the user menu', async () => {
    render(<Header />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /admin/ }));

    expect(screen.getByRole('menuitem', { name: '组织设置' })).toHaveAttribute(
      'href',
      '/organizations/settings',
    );
    expect(screen.queryByRole('link', { name: '管理组织' })).not.toBeInTheDocument();
  });

  it('changes the current password and signs out every session', async () => {
    mockFetchJson.mockResolvedValueOnce({ success: true });
    render(<Header />);
    const user = await openChangePassword();

    await user.type(screen.getByLabelText('当前密码'), 'old-password');
    await user.type(screen.getByLabelText('新密码'), 'new-password');
    await user.type(screen.getByLabelText('确认新密码'), 'new-password');
    await user.click(screen.getByRole('button', { name: '确认修改' }));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'old-password',
          newPassword: 'new-password',
        }),
        reloadOnUnauthorized: false,
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      message: '密码修改成功，请重新登录',
      type: 'success',
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: '密码已修改' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('所有登录会话均已注销');
  });

  it('validates confirmation before sending credentials', async () => {
    render(<Header />);
    const user = await openChangePassword();

    await user.type(screen.getByLabelText('当前密码'), 'old-password');
    await user.type(screen.getByLabelText('新密码'), 'new-password');
    await user.type(screen.getByLabelText('确认新密码'), 'different-password');
    await user.click(screen.getByRole('button', { name: '确认修改' }));

    expect(screen.getByRole('alert')).toHaveTextContent('两次输入的新密码不一致');
    expect(mockFetchJson).not.toHaveBeenCalled();
  });

  it('shows an incorrect-current-password response without exposing input values', async () => {
    mockFetchJson.mockRejectedValueOnce(
      new ApiError(401, 'AUTH_FAILED', '当前密码错误'),
    );
    render(<Header />);
    const user = await openChangePassword();

    await user.type(screen.getByLabelText('当前密码'), 'secret-old-password');
    await user.type(screen.getByLabelText('新密码'), 'secret-new-password');
    await user.type(screen.getByLabelText('确认新密码'), 'secret-new-password');
    await user.click(screen.getByRole('button', { name: '确认修改' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('当前密码错误'));
    expect(mockShowToast).toHaveBeenCalledWith({
      message: '当前密码错误',
      type: 'error',
    });
    expect(screen.queryByText('secret-old-password')).not.toBeInTheDocument();
    expect(screen.queryByText('secret-new-password')).not.toBeInTheDocument();
  });

  it('opens safe session management from the user menu', async () => {
    mockFetchJson.mockResolvedValueOnce({
      sessions: [
        {
          id: 'session-1',
          deviceInfo: 'Chrome · macOS',
          status: 'ACTIVE',
          isCurrent: true,
          createdAt: '2026-07-27T00:00:00.000Z',
          expiresAt: '2026-08-03T00:00:00.000Z',
          revokedAt: null,
          lastSeenAt: '2026-07-27T01:00:00.000Z',
        },
      ],
    });
    render(<Header />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /admin/ }));
    await user.click(screen.getByRole('menuitem', { name: '登录会话' }));

    expect(await screen.findByRole('dialog', { name: '登录会话' })).toBeInTheDocument();
    expect(screen.getByText('Chrome · macOS')).toBeInTheDocument();
    expect(screen.getByText('当前设备')).toBeInTheDocument();
    expect(screen.getByText(/不保存原始令牌或 IP 地址/)).toBeInTheDocument();
    expect(mockFetchJson).toHaveBeenCalledWith('/api/auth/sessions', {
      signal: expect.any(AbortSignal),
      cache: 'no-store',
    });
  });
});
