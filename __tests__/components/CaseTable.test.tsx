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
    rootCause: undefined,
    mrOrTicket: undefined,
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
    rootCause: undefined,
    mrOrTicket: undefined,
    assetSaved: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

const defaultProps = {
  canEdit: true,
  cases: mockCases,
  totalCount: 25,
  page: 1,
  pageSize: 10,
  sortField: 'createdAt' as const,
  sortOrder: 'desc' as const,
  selectedIds: [] as string[],
  onPageChange: jest.fn(),
  onSortChange: jest.fn(),
  onSaveAsset: jest.fn(),
  onViewDetail: jest.fn(),
  onSelectionChange: jest.fn(),
  onClearSelection: jest.fn(),
  onBatchAction: jest.fn(),
};

describe('CaseTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  test('clicking sortable column header calls onSortChange with toggled order', async () => {
    const onSortChange = jest.fn();
    render(
      <CaseTable
        {...defaultProps}
        sortField="caseNo"
        sortOrder="desc"
        onSortChange={onSortChange}
      />,
    );

    // caseNo column header is active in desc state → next click toggles to asc
    const caseNoHeader = screen.getByRole('button', { name: /编号/ });
    await userEvent.setup().click(caseNoHeader);

    expect(onSortChange).toHaveBeenCalledWith({ field: 'caseNo', order: 'asc' });
  });

  test('clicking an inactive column header calls onSortChange with asc', async () => {
    const onSortChange = jest.fn();
    render(
      <CaseTable
        {...defaultProps}
        sortField="createdAt"
        sortOrder="desc"
        onSortChange={onSortChange}
      />,
    );

    const nameHeader = screen.getByRole('button', { name: /名称/ });
    await userEvent.setup().click(nameHeader);

    expect(onSortChange).toHaveBeenCalledWith({ field: 'name', order: 'asc' });
  });

  test('selecting a row checkbox calls onSelectionChange with the id', async () => {
    const onSelectionChange = jest.fn();
    render(<CaseTable {...defaultProps} onSelectionChange={onSelectionChange} />);

    const rowCheckbox = screen.getByLabelText('选择用例 C001');
    await userEvent.setup().click(rowCheckbox);

    expect(onSelectionChange).toHaveBeenCalledWith(['1']);
  });

  test('header checkbox selects all rows on the current page', async () => {
    const onSelectionChange = jest.fn();
    render(<CaseTable {...defaultProps} onSelectionChange={onSelectionChange} />);

    const headerCheckbox = screen.getByLabelText('全选当前页');
    await userEvent.setup().click(headerCheckbox);

    expect(onSelectionChange).toHaveBeenCalledWith(['1', '2']);
  });

  test('header checkbox deselects when all on the page are already selected', async () => {
    const onSelectionChange = jest.fn();
    render(
      <CaseTable
        {...defaultProps}
        selectedIds={['1', '2']}
        onSelectionChange={onSelectionChange}
      />,
    );

    const headerCheckbox = screen.getByLabelText('全选当前页');
    await userEvent.setup().click(headerCheckbox);

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  test('batch action bar appears when there are selectedIds', () => {
    const { container } = render(<CaseTable {...defaultProps} selectedIds={['1', '2']} />);

    // The action bar should render three batch buttons plus a clear button
    expect(screen.getByText('批量更新进展')).toBeInTheDocument();
    expect(screen.getByText('批量指派责任人')).toBeInTheDocument();
    expect(screen.getByText('批量保存资产')).toBeInTheDocument();
    expect(screen.getByText('清除选择')).toBeInTheDocument();

    // The counter is split across text nodes due to the highlighted span;
    // verify by checking the wrapper textContent contains both fragments.
    const counter = container.querySelector('span.text-text-primary');
    expect(counter?.textContent).toContain('已选中');
    expect(counter?.textContent).toContain('个用例');
    expect(counter?.textContent).toContain('2');
  });

  test('clicking batch action button calls onBatchAction with the action type', async () => {
    const onBatchAction = jest.fn();
    render(
      <CaseTable
        {...defaultProps}
        selectedIds={['1', '2']}
        onBatchAction={onBatchAction}
      />,
    );

    await userEvent.setup().click(screen.getByText('批量保存资产'));
    expect(onBatchAction).toHaveBeenCalledWith('assetSaved');

    await userEvent.setup().click(screen.getByText('批量更新进展'));
    expect(onBatchAction).toHaveBeenCalledWith('progressCategory');

    await userEvent.setup().click(screen.getByText('批量指派责任人'));
    expect(onBatchAction).toHaveBeenCalledWith('assignee');
  });

  test('clicking 清除选择 calls onClearSelection', async () => {
    const onClearSelection = jest.fn();
    render(
      <CaseTable
        {...defaultProps}
        selectedIds={['1']}
        onClearSelection={onClearSelection}
      />,
    );

    await userEvent.setup().click(screen.getByText('清除选择'));
    expect(onClearSelection).toHaveBeenCalled();
  });

  test('hides selection and write actions in read-only mode', () => {
    render(
      <CaseTable
        {...defaultProps}
        canEdit={false}
        selectedIds={['1']}
      />,
    );

    expect(screen.queryByLabelText('全选当前页')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('选择用例 C001')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('保存资产')).not.toBeInTheDocument();
    expect(screen.queryByText('批量更新进展')).not.toBeInTheDocument();
    expect(screen.queryByText('批量指派责任人')).not.toBeInTheDocument();
    expect(screen.queryByText('批量保存资产')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('查看详情')).toHaveLength(2);
  });
});
