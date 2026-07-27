/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseSelectOption } from '../../test-utils/select';
import FilterBar from '@/components/workspace/FilterBar';

const projects = [
  { id: 'p1', name: 'Project A' },
  { id: 'p2', name: 'Project B' },
];

const stages = [
  { id: 's1', projectId: 'p1', name: 'Stage 1' },
  { id: 's2', projectId: 'p2', name: 'Stage 2' },
];

const batches = [
  { id: 'b1', projectId: 'p1', testStageId: 's1', name: 'Batch 1' },
];

const defaultProps = {
  projects,
  stages,
  batches,
  selectedProjectId: '',
  selectedStageId: '',
  selectedBatchScopeId: '',
  selectedProgressCategory: '',
  selectedAssetSaved: '',
  search: '',
  resultSummary: '',
  assignee: '',
  rootCause: '',
  dateFrom: '',
  dateTo: '',
  onFilterChange: jest.fn(),
};

describe('FilterBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders scope and advanced filters', () => {
    render(<FilterBar {...defaultProps} />);

    expect(screen.getByLabelText('项目')).toBeInTheDocument();
    expect(screen.getByLabelText('测试阶段')).toBeInTheDocument();
    expect(screen.getByLabelText('批跑范围')).toBeInTheDocument();
    expect(screen.getByLabelText('进展')).toBeInTheDocument();
    expect(screen.getByLabelText('资产状态')).toBeInTheDocument();
    expect(screen.getByLabelText('搜索用例')).toBeInTheDocument();
    expect(screen.getByLabelText('结果概要')).toBeInTheDocument();
    expect(screen.getByLabelText('责任人')).toBeInTheDocument();
    expect(screen.getByLabelText('根因')).toBeInTheDocument();
    expect(screen.getByLabelText('创建日期从')).toBeInTheDocument();
    expect(screen.getByLabelText('创建日期至')).toBeInTheDocument();
  });

  test('cascading: changing project calls onFilterChange', async () => {
    const onFilterChange = jest.fn();
    render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />);

    const user = userEvent.setup();
    await chooseSelectOption(user, screen.getByLabelText('项目'), 'Project A');

    expect(onFilterChange).toHaveBeenCalledWith({
      projectId: 'p1',
      stageId: '',
      batchScopeId: '',
      progressCategory: '',
      assetSaved: '',
      search: '',
      resultSummary: '',
      assignee: '',
      rootCause: '',
      dateFrom: '',
      dateTo: '',
    });
  });

  test('shows empty state for stages when no project selected', () => {
    render(<FilterBar {...defaultProps} />);

    const stageSelect = screen.getByLabelText('测试阶段');
    expect(stageSelect).toBeDisabled();
    expect(stageSelect).toHaveTextContent('全部阶段');
  });

  test('changing progress category calls onFilterChange', async () => {
    const onFilterChange = jest.fn();
    render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />);

    const user = userEvent.setup();
    await chooseSelectOption(user, screen.getByLabelText('进展'), '已修复');

    expect(onFilterChange).toHaveBeenCalledWith({
      projectId: '',
      stageId: '',
      batchScopeId: '',
      progressCategory: 'FIXED',
      assetSaved: '',
      search: '',
      resultSummary: '',
      assignee: '',
      rootCause: '',
      dateFrom: '',
      dateTo: '',
    });
  });

  test('changing asset saved filter calls onFilterChange', async () => {
    const onFilterChange = jest.fn();
    render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />);

    const user = userEvent.setup();
    await chooseSelectOption(user, screen.getByLabelText('资产状态'), '已保存');

    expect(onFilterChange).toHaveBeenCalledWith({
      projectId: '',
      stageId: '',
      batchScopeId: '',
      progressCategory: '',
      assetSaved: 'true',
      search: '',
      resultSummary: '',
      assignee: '',
      rootCause: '',
      dateFrom: '',
      dateTo: '',
    });
  });

  test('emits advanced text, result and date filters', async () => {
    const onFilterChange = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <FilterBar {...defaultProps} onFilterChange={onFilterChange} />,
    );

    await user.type(screen.getByLabelText('搜索用例'), 'TC-1');
    expect(onFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: '1' }),
    );

    rerender(
      <FilterBar
        {...defaultProps}
        search="TC-1"
        onFilterChange={onFilterChange}
      />,
    );
    await chooseSelectOption(user, screen.getByLabelText('结果概要'), 'FAIL');
    expect(onFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'TC-1', resultSummary: 'FAIL' }),
    );

    await user.type(screen.getByLabelText('创建日期从'), '2026-07-01');
    expect(onFilterChange).toHaveBeenCalled();
  });

  test('clears all filters', async () => {
    const onFilterChange = jest.fn();
    render(
      <FilterBar
        {...defaultProps}
        search="支付"
        resultSummary="FAIL"
        assignee="alice"
        onFilterChange={onFilterChange}
      />,
    );

    await userEvent.setup().click(screen.getByRole('button', { name: '清除筛选' }));

    expect(onFilterChange).toHaveBeenLastCalledWith({
      projectId: '',
      stageId: '',
      batchScopeId: '',
      progressCategory: '',
      assetSaved: '',
      search: '',
      resultSummary: '',
      assignee: '',
      rootCause: '',
      dateFrom: '',
      dateTo: '',
    });
  });
});
