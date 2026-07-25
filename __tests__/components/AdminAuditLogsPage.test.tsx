/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import AdminAuditLogsPage from '@/app/admin/audit-logs/page';
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

describe('AdminAuditLogsPage', () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
  });

  it('renders audit log rows for ADMIN', async () => {
    mockFetchJson.mockResolvedValueOnce({
      logs: [
        {
          id: 'l1',
          userId: 'u1',
          action: 'UPDATE',
          entityType: 'case',
          entityId: 'c1',
          changes: { before: { status: 'pending' }, after: { status: 'fixed' } },
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });

    render(<AdminAuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('UPDATE')).toBeInTheDocument();
    });
    expect(screen.getByText('case')).toBeInTheDocument();
    expect(screen.getByText('c1')).toBeInTheDocument();
    // Verify JSON pre renders the changes content
    expect(screen.getByText(/pending/)).toBeInTheDocument();
    // Page indicator
    expect(screen.getAllByText(/1 \/ 1/).length).toBeGreaterThan(0);
  });

  it('shows denial message for non-admin (403)', async () => {
    mockFetchJson.mockRejectedValueOnce(
      new ApiError(403, 'FORBIDDEN', '权限不足'),
    );

    render(<AdminAuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('权限不足，仅管理员可访问')).toBeInTheDocument();
    });
  });
});