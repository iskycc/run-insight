/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseSelectOption } from '../../test-utils/select';
import ImportPage from '@/app/import/page';
import { useAuth } from '@/components/shared/AuthProvider';
import { buildAutoMapping, parseImportFile } from '@/lib/import-file-parser';

jest.mock('@/components/shared/AuthProvider', () => ({
  useAuth: jest.fn(),
}));
jest.mock('@/lib/import-file-parser', () => ({
  buildAutoMapping: jest.fn(),
  parseImportFile: jest.fn(),
}));
jest.mock('@/components/import/FileDropZone', () => ({
  __esModule: true,
  default: ({ onFileAccepted }: { onFileAccepted: (file: File) => Promise<void> }) => (
    <button type="button" onClick={() => void onFileAccepted(new File(['data'], 'cases.xlsx'))}>
      测试上传
    </button>
  ),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedParseImportFile = parseImportFile as jest.MockedFunction<typeof parseImportFile>;
const mockedBuildAutoMapping = buildAutoMapping as jest.MockedFunction<typeof buildAutoMapping>;

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function job(
  id: string,
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED',
  patch: Record<string, unknown> = {},
) {
  return {
    id,
    status,
    progress: status === 'SUCCEEDED' ? 100 : 0,
    totalRows: 1,
    processedRows: status === 'SUCCEEDED' ? 1 : 0,
    errorCount: 0,
    errorSummary: null,
    errorDetails: null,
    importRecordId: null,
    cancelRequested: false,
    ...patch,
  };
}

async function reachConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await user.click(screen.getByRole('button', { name: '测试上传' }));
  await chooseSelectOption(user, screen.getByLabelText('项目'), '项目一');
  await chooseSelectOption(user, screen.getByLabelText('测试阶段'), '阶段一');
  await chooseSelectOption(user, screen.getByLabelText('批跑范围'), '批跑一');
  await user.click(screen.getByRole('button', { name: '校验数据' }));
  await user.click(await screen.findByRole('button', { name: '预览导入差异' }));
  await screen.findByRole('button', { name: '确认并导入' });
}

describe('ImportPage asynchronous jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(performance.now());
        return 1;
      },
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:errors'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });
    mockedUseAuth.mockReturnValue({
      user: { id: 'editor-1', username: 'editor', role: 'EDITOR' },
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn(),
      updateCurrentUser: jest.fn(),
    });
    mockedParseImportFile.mockResolvedValue({
      headers: ['caseNo', 'name', 'resultSummary'],
      rows: [{ caseNo: 'TC-001', name: '登录', resultSummary: 'FAIL' }],
    });
    mockedBuildAutoMapping.mockReturnValue({
      caseNo: 'caseNo',
      name: 'name',
      resultSummary: 'resultSummary',
    });
  });

  it('polls, cancels, retries cancelled/failed work, downloads errors, and links success', async () => {
    let resolveFirstPoll!: (value: Response) => void;
    const firstPoll = new Promise<Response>((resolve) => {
      resolveFirstPoll = resolve;
    });
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return Promise.resolve(response({
          projects: [{ id: 'p1', name: '项目一', canEdit: true }],
        }));
      }
      if (url === '/api/projects/p1/stages') {
        return Promise.resolve(response({
          stages: [{ id: 's1', projectId: 'p1', name: '阶段一' }],
        }));
      }
      if (url === '/api/stages/s1/batches') {
        return Promise.resolve(response({
          batches: [{ id: 'b1', projectId: 'p1', testStageId: 's1', name: '批跑一' }],
        }));
      }
      if (url.startsWith('/api/import-mapping-templates?')) {
        return Promise.resolve(response({ templates: [], canShare: true }));
      }
      if (url === '/api/import') {
        return Promise.resolve(response({
          preview: true,
          total: 1,
          created: 1,
          updated: 0,
          unchanged: 0,
          samples: {
            created: [{ caseNo: 'TC-001', name: '登录' }],
            updated: [],
            unchanged: [],
          },
          errors: [],
        }));
      }
      if (url === '/api/import-jobs' && init?.method === 'POST') {
        return Promise.resolve(response({ job: job('job-1', 'RUNNING') }, 201));
      }
      if (url === '/api/import-jobs/job-1' && init?.method === 'DELETE') {
        return Promise.resolve(response({
          status: 'RUNNING',
          cancelRequested: true,
          message: '取消请求已记录；任务完成后保留实际结果',
        }, 202));
      }
      if (url === '/api/import-jobs/job-1') return firstPoll;
      if (url === '/api/import-jobs/job-1/retry') {
        return Promise.resolve(response({ job: job('job-2', 'PENDING') }, 201));
      }
      if (url === '/api/import-jobs/job-2') {
        return Promise.resolve(response({
          job: job('job-2', 'FAILED', {
            errorCount: 1,
            errorSummary: '数据校验失败',
            errorDetails: [{ row: 2, field: 'caseNo', message: '不能为空' }],
          }),
        }));
      }
      if (url === '/api/import-jobs/job-2/retry') {
        return Promise.resolve(response({ job: job('job-3', 'PENDING') }, 201));
      }
      if (url === '/api/import-jobs/job-3') {
        return Promise.resolve(response({
          job: job('job-3', 'SUCCEEDED', { importRecordId: 'record-3' }),
        }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;
    const anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<ImportPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects', undefined));
    await reachConfirm(user);
    await user.click(screen.getByRole('button', { name: '确认并导入' }));
    expect((await screen.findAllByText('后台处理中')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('处理中').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '请求取消' }));
    expect(await screen.findByText(/保留实际结果/)).toBeInTheDocument();

    await act(async () => {
      resolveFirstPoll(response({ job: job('job-1', 'CANCELLED') }));
    });
    const retryCancelled = await screen.findByRole('button', { name: '重试任务' });
    await waitFor(() => expect(retryCancelled).toBeEnabled());
    await user.click(retryCancelled);

    expect((await screen.findAllByText('不能为空')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '下载错误 CSV' }));
    await user.click(screen.getByRole('button', { name: '下载错误 JSON' }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(anchorClick).toHaveBeenCalledTimes(2);

    const retryFailed = screen.getByRole('button', { name: '重试任务' });
    await waitFor(() => expect(retryFailed).toBeEnabled());
    await user.click(retryFailed);
    expect(await screen.findByText('导入结果')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看导入记录' })).toHaveAttribute(
      'href',
      '/import-history/record-3',
    );
    anchorClick.mockRestore();
  });

  it('aborts an outstanding status request when unmounted', async () => {
    let pollSignal: AbortSignal | null = null;
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return Promise.resolve(response({
          projects: [{ id: 'p1', name: '项目一', canEdit: true }],
        }));
      }
      if (url === '/api/projects/p1/stages') {
        return Promise.resolve(response({
          stages: [{ id: 's1', projectId: 'p1', name: '阶段一' }],
        }));
      }
      if (url === '/api/stages/s1/batches') {
        return Promise.resolve(response({
          batches: [{ id: 'b1', projectId: 'p1', testStageId: 's1', name: '批跑一' }],
        }));
      }
      if (url.startsWith('/api/import-mapping-templates?')) {
        return Promise.resolve(response({ templates: [], canShare: true }));
      }
      if (url === '/api/import') {
        return Promise.resolve(response({
          preview: true,
          total: 1,
          created: 1,
          updated: 0,
          unchanged: 0,
          samples: { created: [], updated: [], unchanged: [] },
          errors: [],
        }));
      }
      if (url === '/api/import-jobs') {
        return Promise.resolve(response({ job: job('job-1', 'PENDING') }, 201));
      }
      if (url === '/api/import-jobs/job-1') {
        pollSignal = init?.signal as AbortSignal;
        return new Promise<Response>(() => undefined);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    const view = render(<ImportPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects', undefined));
    await reachConfirm(user);
    await user.click(screen.getByRole('button', { name: '确认并导入' }));
    await waitFor(() => expect(pollSignal).not.toBeNull());
    view.unmount();
    expect((pollSignal as AbortSignal | null)?.aborted).toBe(true);
  });
});
