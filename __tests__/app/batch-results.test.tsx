/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BatchResultsPage from '@/app/projects/[id]/batches/[batchId]/page';
import { useAuth } from '@/components/shared/AuthProvider';
import { fetchJson } from '@/lib/fetch';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'p1', batchId: 'b1' }),
}));

jest.mock('@/components/shared/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/lib/fetch', () => ({
  ...jest.requireActual('@/lib/fetch'),
  fetchJson: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedFetchJson = fetchJson as jest.MockedFunction<typeof fetchJson>;

const summary = {
  batch: {
    id: 'b1',
    projectId: 'p1',
    testStageId: 's1',
    name: 'Release 3.0',
    archived: false,
    executedAt: '2026-07-28T02:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    environment: 'UAT',
    buildVersion: '3.0.0',
    commitSha: null,
    pipelineUrl: null,
    createdAt: '2026-07-28T01:00:00.000Z',
    updatedAt: '2026-07-28T02:30:00.000Z',
    project: { id: 'p1', name: '支付平台' },
    stage: { id: 's1', name: '回归测试' },
  },
  stats: {
    totalCount: 2,
    passCount: 1,
    failCount: 1,
    blockCount: 0,
    skipCount: 0,
    nonPassCount: 1,
    passRate: 50,
  },
  canEdit: true,
};

const caseRow = {
  id: 'clxxxxxxxxxxxxxxxxxxxxxx1',
  caseNo: 'TC-001',
  name: '登录失败提示',
  resultSummary: 'FAIL',
  logUrl: 'https://example.com/log',
  projectId: 'p1',
  testStageId: 's1',
  batchScopeId: 'b1',
  assignee: 'alice',
  progressCategory: 'PENDING',
  rootCause: null,
  mrOrTicket: null,
  notes: null,
  assetSaved: false,
  updatedBy: null,
  createdAt: '2026-07-28T02:00:00.000Z',
  updatedAt: '2026-07-28T02:10:00.000Z',
};

describe('BatchResultsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: { id: 'admin-1', username: 'admin', role: 'ADMIN' },
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn(),
      updateCurrentUser: jest.fn(),
    });
    mockedFetchJson.mockImplementation(async (url, options) => {
      if (String(url) === '/api/batches/b1/results') return summary;
      if (String(url).startsWith('/api/cases?')) {
        return { cases: [caseRow], total: 1, page: 1, pageSize: 30 };
      }
      if (String(url) === `/api/cases/${caseRow.id}` && options?.method === 'PATCH') {
        return { case: caseRow };
      }
      throw new Error(`Unexpected request: ${String(url)}`);
    });
  });

  it('shows complete stats, searchable results and unfiltered export links', async () => {
    render(<BatchResultsPage />);

    expect(await screen.findByRole('heading', { name: 'Release 3.0 · 批跑结果' })).toBeInTheDocument();
    expect(screen.getByText('PASS 与所有非 PASS 结果均计入本批跑统计。')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '搜索批跑结果' })).toBeInTheDocument();
    expect(screen.getByText('登录失败提示')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /全量 CSV/ })).toHaveAttribute(
      'href',
      '/api/export?batchScopeId=b1&format=csv',
    );
  });

  it('edits one result directly and refreshes the batch data', async () => {
    const user = userEvent.setup();
    render(<BatchResultsPage />);

    await screen.findByText('登录失败提示');
    await user.click(screen.getByRole('button', { name: '编辑' }));
    const nameInput = screen.getByLabelText('用例名称');
    await user.clear(nameInput);
    await user.type(nameInput, '登录失败提示（已更新）');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(mockedFetchJson).toHaveBeenCalledWith(
        `/api/cases/${caseRow.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('登录失败提示（已更新）'),
        }),
      );
    });
  });
});
