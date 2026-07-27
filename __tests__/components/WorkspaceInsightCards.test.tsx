/**
 * @jest-environment jsdom
 */

import type { ReactNode } from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseSelectOption } from '../../test-utils/select';
import FailureQualityCard from '@/components/workspace/FailureQualityCard';
import SavedViewsCard from '@/components/workspace/SavedViewsCard';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pie: () => <div data-testid="progress-pie" />,
  Tooltip: () => null,
}));

describe('workspace insight cards', () => {
  test('shows only metrics that are supported by the current response', () => {
    render(
      <FailureQualityCard
        failureCount={30}
        totalCaseCount={100}
        data={[
          { category: '待分析', count: 8 },
          { category: '已修复', count: 12 },
        ]}
      />,
    );

    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('30.0%')).toBeInTheDocument();
    expect(screen.getByText('暂无历史对比数据')).toBeInTheDocument();
    expect(screen.queryByText(/较上一批/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '全部项目' })).not.toBeInTheDocument();
  });

  test('quick filters have exact labels and emit only their declared filter', async () => {
    const onQuickFilter = jest.fn();
    render(
      <SavedViewsCard
        views={[]}
        loading={false}
        saving={false}
        canShare={false}
        currentProjectId=""
        onSelect={jest.fn()}
        onQuickFilter={onQuickFilter}
        onCreate={jest.fn().mockResolvedValue(true)}
        onUpdate={jest.fn().mockResolvedValue(undefined)}
        onSetDefault={jest.fn().mockResolvedValue(undefined)}
        onDelete={jest.fn().mockResolvedValue(undefined)}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /失败用例/ }));
    expect(onQuickFilter).toHaveBeenLastCalledWith({ resultSummary: 'FAIL' });

    await user.click(screen.getByRole('button', { name: /已保存资产/ }));
    expect(onQuickFilter).toHaveBeenLastCalledWith({ assetSaved: 'true' });

    expect(screen.queryByText(/今日/)).not.toBeInTheDocument();
    expect(screen.queryByText(/高优先级/)).not.toBeInTheDocument();
    expect(screen.queryByText(/最近 7 天/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '管理' })).not.toBeInTheDocument();
  });

  test('creates, loads and manages persisted views', async () => {
    const onSelect = jest.fn();
    const onCreate = jest.fn().mockResolvedValue(true);
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    const onSetDefault = jest.fn().mockResolvedValue(undefined);
    const onDelete = jest.fn().mockResolvedValue(undefined);
    render(
      <SavedViewsCard
        views={[
          {
            id: 'view_1',
            ownerId: 'user_1',
            ownerName: 'alice',
            projectId: null,
            name: '我的失败用例',
            filters: { resultSummary: 'FAIL' },
            scope: 'PERSONAL',
            isDefault: false,
            isOwner: true,
            canManage: true,
            createdAt: '2026-07-26T00:00:00.000Z',
            updatedAt: '2026-07-26T00:00:00.000Z',
          },
        ]}
        loading={false}
        saving={false}
        canShare
        currentProjectId="project_1"
        onSelect={onSelect}
        onQuickFilter={jest.fn()}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
        onDelete={onDelete}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '加载视图 我的失败用例' }));
    expect(onSelect).toHaveBeenCalledWith({ resultSummary: 'FAIL' });

    await user.click(
      screen.getByRole('button', { name: '用当前筛选更新视图 我的失败用例' }),
    );
    expect(onUpdate).toHaveBeenCalledWith('view_1');

    await user.click(screen.getByRole('button', { name: '设为默认视图 我的失败用例' }));
    expect(onSetDefault).toHaveBeenCalledWith('view_1');

    await user.click(screen.getByRole('button', { name: '删除视图 我的失败用例' }));
    expect(onDelete).toHaveBeenCalledWith('view_1');

    await user.click(screen.getByRole('button', { name: '保存当前' }));
    await user.type(screen.getByLabelText('视图名称'), '项目失败');
    await chooseSelectOption(user, screen.getByLabelText('保存范围'), '项目共享');
    await user.click(screen.getByText('设为默认'));
    await user.click(screen.getByRole('button', { name: '确认保存' }));

    expect(onCreate).toHaveBeenCalledWith({
      name: '项目失败',
      scope: 'PROJECT',
      isDefault: true,
    });
  });
});
