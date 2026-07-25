/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import AdminUsersPage from '@/app/admin/users/page';
import { ApiError } from '@/lib/fetch';

const mockFetchJson = jest.fn();
const mockShowToast = jest.fn();
const mockUseAuth = jest.fn(() => ({ user: { id: 'u1', username: 'admin' }, isLoading: false }));

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
  });

  it('renders users for ADMIN', async () => {
    mockFetchJson.mockResolvedValueOnce({
      users: [
        { id: 'u1', username: 'admin', role: 'ADMIN', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        { id: 'u2', username: 'editor', role: 'EDITOR', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
      ],
    });

    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建用户' })).toBeInTheDocument();
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
});