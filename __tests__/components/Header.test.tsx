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

  it('changes the current password and offers a fresh login', async () => {
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
      message: '密码修改成功',
      type: 'success',
    });
    expect(screen.getByRole('dialog', { name: '密码已修改' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '退出并重新登录' }));
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
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
});
