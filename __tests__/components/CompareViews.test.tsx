/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import CompareView from '@/components/compare/CompareView';
import MatrixView from '@/components/compare/MatrixView';
import type { CompareResponse, MatrixResponse } from '@/types';

describe('compare result views', () => {
  it('shows other result transitions and links them to the second batch in workspace', () => {
    const data: CompareResponse = {
      batchA: { id: 'batch-a', name: 'A', caseCount: 1 },
      batchB: { id: 'batch-b', name: 'B', caseCount: 1 },
      diff: {
        unchanged: 0,
        passToFail: [],
        failToPass: [],
        otherChanges: [
          {
            caseNo: 'TC/BLOCK 1',
            name: '状态互转',
            resultA: 'BLOCK',
            resultB: 'SKIP',
          },
        ],
        newInB: [],
        removedFromB: [],
      },
    };

    render(<CompareView data={data} projectId="proj-1" stageId="stage-1" />);

    fireEvent.click(screen.getByRole('tab', { name: '其他变更 (1)' }));

    const link = screen.getByRole('link', { name: '在工作台查看用例 TC/BLOCK 1' });
    expect(link).toHaveAttribute(
      'href',
      '/workspace?search=TC%2FBLOCK+1&batchScopeId=batch-b&projectId=proj-1&testStageId=stage-1',
    );
    expect(screen.getByText('BLOCK')).toBeInTheDocument();
    expect(screen.getByText('SKIP')).toBeInTheDocument();
  });

  it('uses the first batch for a removed case drill-down', () => {
    const data: CompareResponse = {
      batchA: { id: 'batch-a', name: 'A', caseCount: 1 },
      batchB: { id: 'batch-b', name: 'B', caseCount: 0 },
      diff: {
        unchanged: 0,
        passToFail: [],
        failToPass: [],
        otherChanges: [],
        newInB: [],
        removedFromB: [
          { caseNo: 'TC-1', name: '已移除', resultA: 'PASS', resultB: '-' },
        ],
      },
    };

    render(<CompareView data={data} projectId="proj-1" stageId="stage-1" />);
    fireEvent.click(screen.getByRole('tab', { name: '移除 (1)' }));

    expect(screen.getByRole('link', { name: '在工作台查看用例 TC-1' }))
      .toHaveAttribute(
        'href',
        '/workspace?search=TC-1&batchScopeId=batch-a&projectId=proj-1&testStageId=stage-1',
      );
  });

  it('links each matrix result to the corresponding batch', () => {
    const data: MatrixResponse = {
      batches: [
        { id: 'batch-a', name: 'A' },
        { id: 'batch-b', name: 'B' },
      ],
      rows: [
        {
          caseNo: 'TC-9',
          name: '矩阵用例',
          results: { 'batch-a': 'PASS', 'batch-b': 'FAIL' },
        },
      ],
    };

    render(<MatrixView data={data} projectId="proj-1" stageId="stage-1" />);

    expect(screen.getByRole('link', { name: '查看 TC-9 在 B 的结果' }))
      .toHaveAttribute(
        'href',
        '/workspace?search=TC-9&batchScopeId=batch-b&projectId=proj-1&testStageId=stage-1',
      );
  });
});
