/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  onFilterChange: jest.fn(),
};

describe('FilterBar', () => {
  test('renders project/stage/batch selects', () => {
    render(<FilterBar {...defaultProps} />);

    expect(screen.getByLabelText('项目')).toBeInTheDocument();
    expect(screen.getByLabelText('测试阶段')).toBeInTheDocument();
    expect(screen.getByLabelText('批跑范围')).toBeInTheDocument();
  });

  test('cascading: changing project calls onFilterChange', async () => {
    const onFilterChange = jest.fn();
    render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />);

    await userEvent.setup().selectOptions(screen.getByLabelText('项目'), 'p1');

    expect(onFilterChange).toHaveBeenCalledWith({
      projectId: 'p1',
      stageId: '',
      batchScopeId: '',
    });
  });

  test('shows empty state for stages when no project selected', () => {
    render(<FilterBar {...defaultProps} />);

    const stageSelect = screen.getByLabelText('测试阶段') as HTMLSelectElement;
    // Only the default "全部阶段" option should be present
    const stageOptions = Array.from(stageSelect.options);
    expect(stageOptions).toHaveLength(1);
    expect(stageOptions[0].value).toBe('');
  });
});
