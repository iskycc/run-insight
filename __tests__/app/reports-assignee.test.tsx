/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/components/shared/AuthProvider';
import AssigneeReportPage from '@/app/reports/assignee/page';

// recharts relies on DOM measurement APIs that jsdom doesn't provide; mock the
// visual primitives so smoke tests don't blow up, while leaving behavior intact.
jest.mock('recharts', () => {
  const Original = jest.requireActual('recharts');
  const MockChart = ({ children }: { children: React.ReactNode }) => <div data-testid="mock-chart">{children}</div>;
  const MockResponsiveContainer = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-responsive">{children}</div>
  );
  return {
    ...Original,
    ResponsiveContainer: MockResponsiveContainer,
    BarChart: MockChart,
    LineChart: MockChart,
  };
});

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

describe('AssigneeReportPage', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn();
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it('shows login prompt when user is not authenticated', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(mockJsonResponse({ user: null }));

    renderWithProviders(<AssigneeReportPage />);

    await waitFor(() => {
      expect(screen.getByText('请先登录以查看责任人报告')).toBeInTheDocument();
    });
  });

  it('renders assignee rows for authenticated user', async () => {
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
    const stats = {
      stats: [
        {
          assignee: 'alice',
          totalCases: 10,
          failCount: 4,
          fixCount: 3,
          savedAssetCount: 2,
          fixRate: 0.75,
        },
        {
          assignee: 'bob',
          totalCases: 5,
          failCount: 0,
          fixCount: 0,
          savedAssetCount: 0,
          fixRate: 0,
        },
      ],
    };

    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return mockJsonResponse({ user });
      if (url.includes('/api/projects') && !url.includes('/stages')) return mockJsonResponse(projects);
      if (url.includes('/api/stats/assignee')) return mockJsonResponse(stats);
      return mockJsonResponse({}, false, 404);
    });

    renderWithProviders(<AssigneeReportPage />);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('Top 10 失败用例数')).toBeInTheDocument();
    expect(screen.getByText(/责任人统计/)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: '查看 alice 的用例' }))
      .toHaveAttribute('href', '/workspace?assignee=alice');

    const exportLink = screen.getByRole('link', { name: '导出 CSV' });
    expect(exportLink).toHaveAttribute('download', 'assignee-stats.csv');
    const csvHref = exportLink.getAttribute('href') ?? '';
    const csv = decodeURIComponent(csvHref.split(',')[1] ?? '');
    expect(csv).toContain('"责任人","总用例数","失败数","修复数","已保存资产","修复率"');
    expect(csv).toContain('"alice","10","4","3","2","75%"');
  });

  it('shows empty state when there are no assignees', async () => {
    const user = { id: 'u-1', username: 'admin', createdAt: '2026-01-01T00:00:00.000Z' };
    const projects = { projects: [] };
    const stats = { stats: [] };

    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return mockJsonResponse({ user });
      if (url.includes('/api/projects')) return mockJsonResponse(projects);
      if (url.includes('/api/stats/assignee')) return mockJsonResponse(stats);
      return mockJsonResponse({}, false, 404);
    });

    renderWithProviders(<AssigneeReportPage />);

    await waitFor(() => {
      // EmptyState title appears as an h3; the chart also shows 暂无数据.
      expect(screen.getByRole('heading', { level: 3, name: '暂无数据' })).toBeInTheDocument();
    });
    expect(screen.getByText(/调整项目\/阶段\/批跑范围筛选/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '导出 CSV' })).toHaveAttribute('aria-disabled', 'true');
  });
});
