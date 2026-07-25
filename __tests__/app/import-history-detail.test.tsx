/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { useParams } from 'next/navigation';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/components/shared/AuthProvider';
import ImportHistoryDetailPage from '@/app/import-history/[id]/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useParams: jest.fn(),
}));

const mockedUseParams = useParams as jest.Mock;

const originalFetch = globalThis.fetch;

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => body,
  } as Response);
}

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <ToastProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ToastProvider>
  );
}

describe('ImportHistoryDetailPage', () => {
  beforeEach(() => {
    mockedUseParams.mockReturnValue({ id: 'rec-1' });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn();
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('shows login prompt when user is not authenticated', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(mockJsonResponse({ user: null }));

    renderWithProviders(<ImportHistoryDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('请先登录以查看导入记录')).toBeInTheDocument();
    });
  });

  it('renders record details including errors block for authenticated user', async () => {
    const detail = {
      id: 'rec-1',
      projectId: 'proj-1',
      importType: 'pre-analysis',
      fileName: 'cases.csv',
      totalRows: 10,
      importedCount: 7,
      errorCount: 3,
      errors: [
        { row: 3, field: 'caseNo', message: '用例编号不能为空' },
        { row: 7, field: 'name', message: '名称必填' },
      ],
      userId: 'u-1',
      projectName: 'Demo',
      username: 'admin',
      status: 'partial',
      createdAt: '2026-07-20T08:30:00.000Z',
    };

    const user = { id: 'u-1', username: 'admin', createdAt: '2026-01-01T00:00:00.000Z' };
    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return mockJsonResponse({ user });
      if (url.includes('/api/import-history/rec-1')) return mockJsonResponse(detail);
      return mockJsonResponse({}, false, 404);
    });

    renderWithProviders(<ImportHistoryDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('cases.csv')).toBeInTheDocument();
    });

    expect(screen.getByText('总行数')).toBeInTheDocument();
    expect(screen.getByText('错误明细')).toBeInTheDocument();
    expect(screen.getByText(/用例编号不能为空/)).toBeInTheDocument();
    expect(screen.getByText(/名称必填/)).toBeInTheDocument();
    expect(screen.getByText('返回列表')).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });
});
