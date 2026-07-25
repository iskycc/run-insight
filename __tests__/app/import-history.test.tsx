/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/components/shared/AuthProvider';
import ImportHistoryPage from '@/app/import-history/page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useParams: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.Mock;

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

describe('ImportHistoryPage', () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({ push: jest.fn(), back: jest.fn() });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn();
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it('shows login prompt when user is not authenticated', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(mockJsonResponse({ user: null }));

    renderWithProviders(<ImportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('请先登录以查看导入历史')).toBeInTheDocument();
    });
  });

  it('renders import history records for authenticated user', async () => {
    const record = {
      id: 'rec-1',
      projectId: 'proj-1',
      importType: 'pre-analysis',
      fileName: 'cases-2026-07.csv',
      totalRows: 100,
      importedCount: 95,
      errorCount: 5,
      userId: 'u-1',
      createdAt: '2026-07-20T08:30:00.000Z',
    };

    const user = { id: 'u-1', username: 'admin', createdAt: '2026-01-01T00:00:00.000Z' };
    const projects = {
      projects: [
        {
          id: 'proj-1',
          name: 'Demo',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          archived: false,
          stageCount: 0,
          caseCount: 0,
          passCount: 0,
          failCount: 0,
        },
      ],
    };
    const history = { records: [record], total: 1, page: 1, pageSize: 20 };

    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return mockJsonResponse({ user });
      if (url.includes('/api/projects')) return mockJsonResponse(projects);
      if (url.includes('/api/import-history')) return mockJsonResponse(history);
      return mockJsonResponse({}, false, 404);
    });

    renderWithProviders(<ImportHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('cases-2026-07.csv')).toBeInTheDocument();
    });

    expect(screen.getByText('100')).toBeInTheDocument(); // totalRows
    expect(screen.getByText('95')).toBeInTheDocument();  // importedCount
    expect(screen.getByText('5')).toBeInTheDocument();   // errorCount
  });
});
