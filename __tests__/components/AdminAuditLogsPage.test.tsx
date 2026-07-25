/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminAuditLogsPage from '@/app/admin/audit-logs/page';
import { ApiError } from '@/lib/fetch';

const mockFetchJson = jest.fn();
const mockShowToast = jest.fn();

jest.mock('@/lib/fetch', () => {
  const actual = jest.requireActual('@/lib/fetch');
  return {
    ...actual,
    fetchJson: (...args: unknown[]) => mockFetchJson(...args),
  };
});

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast, hideToast: jest.fn(), toasts: [] }),
}));

const auditResponse = {
  logs: [
    {
      id: 'l1',
      userId: 'u1',
      username: 'admin',
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
};

const usersResponse = {
  users: [
    {
      id: 'u1',
      username: 'admin',
      role: 'ADMIN',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
};

function mockSuccessfulRequests() {
  mockFetchJson.mockImplementation((url: string) => {
    if (url === '/api/users') return Promise.resolve(usersResponse);
    if (url.startsWith('/api/audit-logs?')) return Promise.resolve(auditResponse);
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

describe('AdminAuditLogsPage', () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
    mockShowToast.mockReset();
  });

  it('renders readable rows and keeps raw changes collapsed by default', async () => {
    mockSuccessfulRequests();
    const user = userEvent.setup();

    render(<AdminAuditLogsPage />);

    expect(await screen.findByText('c1')).toBeInTheDocument();
    expect(screen.getAllByText('用例').length).toBeGreaterThan(1);
    expect(screen.getAllByText('admin').length).toBeGreaterThan(1);
    expect(screen.getByRole('option', { name: '知识资产' })).toHaveValue('asset');
    expect(screen.getByRole('option', { name: '项目成员' })).toHaveValue('member');
    expect(screen.getByRole('option', { name: 'API Key' })).toHaveValue('apiKey');
    expect(screen.getByRole('option', { name: '根因分类' })).toHaveValue(
      'rootCauseCategory',
    );
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看详情' }));
    expect(screen.getByText(/pending/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起详情' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getAllByText(/1 \/ 1/).length).toBeGreaterThan(0);
  });

  it('applies all filters to the list request and CSV export link', async () => {
    mockSuccessfulRequests();
    const user = userEvent.setup();

    render(<AdminAuditLogsPage />);
    await screen.findByText('c1');
    await waitFor(() => expect(screen.getByLabelText('用户')).toHaveValue(''));

    await user.selectOptions(screen.getByLabelText('用户'), 'u1');
    await user.selectOptions(screen.getByLabelText('动作'), 'UPDATE');
    await user.selectOptions(screen.getByLabelText('实体类型'), 'case');
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2025-01-31' } });
    await user.click(screen.getByRole('button', { name: '应用筛选' }));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/audit-logs?userId=u1&action=UPDATE&entityType=case&dateFrom=2025-01-01&dateTo=2025-01-31&page=1&pageSize=50',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(screen.getByRole('link', { name: '导出 CSV' })).toHaveAttribute(
      'href',
      '/api/audit-logs?userId=u1&action=UPDATE&entityType=case&dateFrom=2025-01-01&dateTo=2025-01-31&format=csv',
    );
  });

  it('blocks an inverted date range before requesting logs', async () => {
    mockSuccessfulRequests();
    const user = userEvent.setup();

    render(<AdminAuditLogsPage />);
    await screen.findByText('c1');
    const auditCallsBefore = mockFetchJson.mock.calls.filter(
      ([url]) => String(url).startsWith('/api/audit-logs?'),
    ).length;

    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2025-02-02' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2025-02-01' } });
    await user.click(screen.getByRole('button', { name: '应用筛选' }));

    expect(mockShowToast).toHaveBeenCalledWith({
      message: '开始日期不能晚于结束日期',
      type: 'error',
    });
    expect(mockFetchJson.mock.calls.filter(
      ([url]) => String(url).startsWith('/api/audit-logs?'),
    )).toHaveLength(auditCallsBefore);
  });

  it('shows denial message for non-admin (403)', async () => {
    mockFetchJson.mockImplementation((url: string) => {
      if (url === '/api/users') return Promise.resolve(usersResponse);
      return Promise.reject(new ApiError(403, 'FORBIDDEN', '权限不足'));
    });

    render(<AdminAuditLogsPage />);

    expect(await screen.findByText('权限不足，仅管理员可访问')).toBeInTheDocument();
  });
});
