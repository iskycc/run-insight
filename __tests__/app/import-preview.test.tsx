/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    <button type="button" onClick={() => void onFileAccepted(new File(['data'], 'cases.csv'))}>
      测试上传
    </button>
  ),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedParseImportFile = parseImportFile as jest.MockedFunction<typeof parseImportFile>;
const mockedBuildAutoMapping = buildAutoMapping as jest.MockedFunction<typeof buildAutoMapping>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('ImportPage preview flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(performance.now());
        return 1;
      },
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

  it('requires a read-only preview before final import and suppresses duplicate submission', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects') {
        return jsonResponse({
          projects: [{ id: 'p1', name: '项目一', canEdit: true }],
        });
      }
      if (url === '/api/projects/p1/stages') {
        return jsonResponse({ stages: [{ id: 's1', projectId: 'p1', name: '阶段一' }] });
      }
      if (url === '/api/stages/s1/batches') {
        return jsonResponse({
          batches: [{ id: 'b1', projectId: 'p1', testStageId: 's1', name: '批跑一' }],
        });
      }
      if (url.startsWith('/api/import-mapping-templates?')) {
        return jsonResponse({ templates: [], canShare: true });
      }
      if (url === '/api/import') {
        const payload = JSON.parse(String(init?.body)) as { preview?: boolean };
        expect(payload.preview).toBe(true);
        return jsonResponse({
          preview: true,
          total: 1,
          created: 0,
          updated: 1,
          unchanged: 0,
          samples: {
            created: [],
            updated: [{ caseNo: 'TC-001', name: '登录' }],
            unchanged: [],
          },
          errors: [],
        });
      }
      if (url === '/api/import-jobs') {
        return jsonResponse({
          job: {
            id: 'job-1',
            status: 'PENDING',
            progress: 0,
            totalRows: 1,
            processedRows: 0,
            errorCount: 0,
            errorSummary: null,
            errorDetails: null,
            importRecordId: null,
            cancelRequested: false,
          },
        }, 201);
      }
      if (url === '/api/import-jobs/job-1') {
        return jsonResponse({
          job: {
            id: 'job-1',
            status: 'SUCCEEDED',
            progress: 100,
            totalRows: 1,
            processedRows: 1,
            errorCount: 0,
            errorSummary: null,
            errorDetails: null,
            importRecordId: 'record-1',
            cancelRequested: false,
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    render(<ImportPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects', undefined));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByRole('button', { name: '测试上传' }));
    await screen.findByText('导入目标');
    await chooseSelectOption(user, screen.getByLabelText('项目'), '项目一');
    await chooseSelectOption(user, screen.getByLabelText('测试阶段'), '阶段一');
    await chooseSelectOption(user, screen.getByLabelText('批跑范围'), '批跑一');
    await user.click(screen.getByRole('button', { name: '校验数据' }));

    expect(await screen.findByRole('button', { name: '预览导入差异' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认并导入' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '预览导入差异' }));

    expect(await screen.findByText('导入差异预览')).toBeInTheDocument();
    expect(screen.getByText('预览不会写入数据库。确认后才会执行正式导入。')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: '确认并导入' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(await screen.findByText('导入结果')).toBeInTheDocument();
    const importCalls = fetchMock.mock.calls.filter(([input]) => String(input) === '/api/import');
    expect(importCalls).toHaveLength(1);
    expect(JSON.parse(String(importCalls[0][1]?.body))).toEqual(expect.objectContaining({ preview: true }));
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/import-jobs')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/import-jobs/job-1')).toHaveLength(1);
    expect(screen.getByRole('link', { name: '查看导入记录' })).toHaveAttribute(
      'href',
      '/import-history/record-1',
    );
    await waitFor(() => expect(screen.getByText('成功导入')).toBeInTheDocument());
  });
});
