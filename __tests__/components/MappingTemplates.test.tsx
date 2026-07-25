/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MappingTemplates from '@/components/import/MappingTemplates';

describe('MappingTemplates', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves, applies, and deletes a named template for the import type', async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();
    const { rerender } = render(
      <MappingTemplates
        key="pre-analysis"
        importType="pre-analysis"
        headers={['编号', '名称']}
        mapping={{ caseNo: '编号', name: '名称' }}
        onApply={onApply}
      />
    );

    await user.type(screen.getByLabelText('映射模板名称'), '标准 CSV');
    await user.click(screen.getByRole('button', { name: '保存模板' }));

    expect(screen.getByText('模板已保存')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(
      'run-insight:import-mapping-templates:pre-analysis'
    ) ?? '[]')).toEqual([
      { name: '标准 CSV', mapping: { caseNo: '编号', name: '名称' } },
    ]);

    rerender(
      <MappingTemplates
        importType="pre-analysis"
        headers={['编号']}
        mapping={{}}
        onApply={onApply}
      />
    );
    await user.selectOptions(screen.getByLabelText('已保存映射模板'), '标准 CSV');
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(onApply).toHaveBeenCalledWith({ caseNo: '编号' });
    expect(screen.getByText(/文件中不存在的列已忽略/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.getByText('模板已删除')).toBeInTheDocument();
    expect(window.localStorage.getItem(
      'run-insight:import-mapping-templates:pre-analysis'
    )).toBe('[]');
  });

  it('keeps pre-analysis and post-analysis templates separate', async () => {
    window.localStorage.setItem(
      'run-insight:import-mapping-templates:post-analysis',
      JSON.stringify([{ name: '分析后模板', mapping: { assignee: '负责人' } }])
    );
    const { rerender } = render(
      <MappingTemplates
        importType="pre-analysis"
        headers={['负责人']}
        mapping={{}}
        onApply={jest.fn()}
      />
    );

    expect(screen.queryByRole('option', { name: '分析后模板' })).not.toBeInTheDocument();

    rerender(
      <MappingTemplates
        key="post-analysis"
        importType="post-analysis"
        headers={['负责人']}
        mapping={{}}
        onApply={jest.fn()}
      />
    );

    expect(await screen.findByRole('option', { name: '分析后模板' })).toBeInTheDocument();
  });

  it('ignores corrupt browser storage', () => {
    window.localStorage.setItem(
      'run-insight:import-mapping-templates:pre-analysis',
      '{not-json'
    );

    render(
      <MappingTemplates
        importType="pre-analysis"
        headers={[]}
        mapping={{}}
        onApply={jest.fn()}
      />
    );

    expect(screen.getByLabelText('已保存映射模板')).toHaveValue('');
  });
});
