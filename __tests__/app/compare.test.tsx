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
});
