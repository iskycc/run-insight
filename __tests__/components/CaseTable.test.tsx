/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaseTable from '@/components/workspace/CaseTable';

const mockCases = [
  {
    id: '1',
    caseNo: 'C001',
    name: 'Test Case 1',
    resultSummary: 'PASS',
    logUrl: '',
    projectId: 'p1',
    testStageId: 's1',
    batchScopeId: 'b1',
    assignee: 'alice',
    progressCategory: 'FIXED',
    rootCause: null,
    mrOrTicket: null,
    assetSaved: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: '2',
    caseNo: 'C002',
    name: 'Test Case 2',
    resultSummary: 'FAIL',
    logUrl: '',
    projectId: 'p1',
    testStageId: 's1',
    batchScopeId: 'b1',
    assignee: undefined,
    progressCategory: undefined,
    rootCause: null,
    mrOrTicket: null,
    assetSaved: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

const defaultProps = {
  cases: mockCases,
  totalCount: 25,
  page: 1,
  pageSize: 10,
  onPageChange: jest.fn(),
  onSortChange: jest.fn(),
  onSaveAsset: jest.fn(),
  onViewDetail: jest.fn(),
};

describe('CaseTable', () => {
  test('renders table with case rows', () => {
    render(<CaseTable {...defaultProps} />);

    expect(screen.getByText('C001')).toBeInTheDocument();
    expect(screen.getByText('C002')).toBeInTheDocument();
    expect(screen.getByText('Test Case 1')).toBeInTheDocument();
    expect(screen.getByText('Test Case 2')).toBeInTheDocument();
  });

  test('shows empty state when no cases', () => {
    render(<CaseTable {...defaultProps} cases={[]} />);

    expect(screen.getByText('暂无用例数据')).toBeInTheDocument();
  });

  test('pagination: clicking next page calls onPageChange', async () => {
    const onPageChange = jest.fn();
    render(<CaseTable {...defaultProps} onPageChange={onPageChange} />);

    const nextButton = screen.getByText('下一页');
    await userEvent.setup().click(nextButton);

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  test('clicking save asset button calls onSaveAsset', async () => {
    const onSaveAsset = jest.fn();
    render(<CaseTable {...defaultProps} onSaveAsset={onSaveAsset} />);

    // Case 1 has progressCategory='FIXED' and assetSaved=false, so save button shows
    const saveButtons = screen.getAllByLabelText('保存资产');
    await userEvent.setup().click(saveButtons[0]);

    expect(onSaveAsset).toHaveBeenCalledWith('1');
  });

  test('clicking view detail calls onViewDetail', async () => {
    const onViewDetail = jest.fn();
    render(<CaseTable {...defaultProps} onViewDetail={onViewDetail} />);

    const detailButtons = screen.getAllByLabelText('查看详情');
    await userEvent.setup().click(detailButtons[0]);

    expect(onViewDetail).toHaveBeenCalledWith('1');
  });
});
