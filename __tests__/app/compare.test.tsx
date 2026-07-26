/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComparePage from '@/app/compare/page';
import { ToastProvider } from '@/contexts/ToastContext';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

describe('ComparePage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/compare');
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn(
      (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/projects') {
          return jsonResponse({ projects: [{ id: 'proj-1', name: '项目一' }] });
        }
        if (url === '/api/projects/proj-1/stages') {
          return jsonResponse({ stages: [{ id: 'stage-1', name: '阶段一' }] });
        }
        if (url === '/api/stages/stage-1/batches') {
          return jsonResponse({
            batches: [
              { id: 'batch-1', name: '批跑一' },
              { id: 'batch-2', name: '批跑二' },
              { id: 'batch-3', name: '批跑三' },
            ],
          });
        }
        if (url.startsWith('/api/stats/matrix?')) {
          return jsonResponse({
            batches: [
              { id: 'batch-1', name: '批跑一' },
              { id: 'batch-2', name: '批跑二' },
            ],
            rows: [],
          });
        }
        if (url.startsWith('/api/stats/quality-gate?')) {
          return jsonResponse({
            passed: false,
            reasons: ['失败用例 2 个，要求不高于 1 个'],
            thresholds: {
              minPassRate: 90,
              maxFailCount: 1,
              maxBlockCount: 0,
              maxPendingCount: 0,
            },
            batch: {
              id: 'batch-2',
              name: '批跑二',
              projectId: 'proj-1',
              testStageId: 'stage-1',
              executedAt: '2026-07-27T08:00:00.000Z',
            },
            metrics: {
              totalCount: 10,
              passCount: 8,
              failCount: 2,
              blockCount: 0,
              pendingCount: 0,
              passRate: 80,
            },
            checks: [
              {
                metric: 'minPassRate',
                label: '通过率',
                actual: 80,
                threshold: 90,
                passed: false,
                reason: '通过率 80%，要求不低于 90%',
              },
              {
                metric: 'maxFailCount',
                label: '失败用例',
                actual: 2,
                threshold: 1,
                passed: false,
                reason: '失败用例 2 个，要求不高于 1 个',
              },
            ],
            comparison: {
              baselineBatchId: 'batch-1',
              baselineBatchName: '批跑一',
              baselinePassRate: 90,
              delta: -10,
              regression: true,
            },
          });
        }
        return jsonResponse({}, false);
      },
    );
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it('selects matrix batches from the project/stage cascade and requires two', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ComparePage />
      </ToastProvider>,
    );

    const projectSelect = screen.getAllByRole('combobox')[0];
    fireEvent.focus(projectSelect);
    await screen.findByRole('option', { name: '项目一' });
    await user.selectOptions(projectSelect, 'proj-1');

    const stageSelect = screen.getAllByRole('combobox')[1];
    await screen.findByRole('option', { name: '阶段一' });
    await user.selectOptions(stageSelect, 'stage-1');

    await waitFor(() => {
      expect(screen.getAllByRole('option', { name: '批跑一' })).toHaveLength(2);
    });
    await user.click(screen.getByRole('button', { name: '趋势矩阵' }));

    const listbox = screen.getByRole('listbox', { name: '批跑（至少选择 2 个）' });
    const queryButton = screen.getByRole('button', { name: '查询' });
    expect(queryButton).toBeDisabled();

    await user.selectOptions(listbox, ['batch-1']);
    expect(queryButton).toBeDisabled();

    await user.selectOptions(listbox, ['batch-1', 'batch-2']);
    expect(queryButton).toBeEnabled();
    expect(document.getElementById('matrix-batches-help')).toHaveTextContent('已选择 2 个。');

    await user.click(queryButton);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/stats/matrix?projectId=proj-1&stageId=stage-1&batchIds=batch-1%2Cbatch-2',
      );
    });
  });

  it('disables comparison when A and B are the same batch', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ComparePage />
      </ToastProvider>,
    );

    const selects = screen.getAllByRole('combobox');
    fireEvent.focus(selects[0]);
    await screen.findByRole('option', { name: '项目一' });
    await user.selectOptions(selects[0], 'proj-1');
    await screen.findByRole('option', { name: '阶段一' });
    await user.selectOptions(selects[1], 'stage-1');
    await waitFor(() => {
      expect(screen.getAllByRole('option', { name: '批跑一' })).toHaveLength(2);
    });

    await user.selectOptions(selects[2], 'batch-1');
    await user.selectOptions(selects[3], 'batch-1');

    expect(screen.getByRole('button', { name: '对比' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('批跑 A 和批跑 B 不能相同');
  });

  it('runs a shareable quality gate and links directly to failed cases', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ComparePage />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '质量门禁' }));
    const projectSelect = screen.getByRole('combobox', { name: '项目' });
    fireEvent.focus(projectSelect);
    await screen.findByRole('option', { name: '项目一' });
    await user.selectOptions(projectSelect, 'proj-1');
    await user.type(screen.getByLabelText('批跑 ID（可选）'), 'batch-2');
    await user.clear(screen.getByLabelText('最低通过率（%）'));
    await user.type(screen.getByLabelText('最低通过率（%）'), '90');
    await user.clear(screen.getByLabelText('最多失败用例'));
    await user.type(screen.getByLabelText('最多失败用例'), '1');

    await user.click(screen.getByRole('button', { name: '运行质量门禁' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/stats/quality-gate?projectId=proj-1&minPassRate=90&maxFailCount=1&maxBlockCount=0&maxPendingCount=0&batchId=batch-2',
      );
    });
    expect(await screen.findByText('门禁未通过')).toBeInTheDocument();
    expect(screen.getByText(/发生回归/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看失败用例' })).toHaveAttribute(
      'href',
      '/workspace?projectId=proj-1&testStageId=stage-1&batchScopeId=batch-2&resultSummary=FAIL',
    );
    expect(window.location.search).toContain('minPassRate=90');
    expect(window.location.search).toContain('tab=quality');
  });
});
