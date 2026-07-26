'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageContainer } from '@/components/layout/PageContainer';
import { Select } from '@/components/shared/Select';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/shared/Button';
import { useAuth } from '@/components/shared/AuthProvider';
import { ApiError, fetchJson } from '@/lib/fetch';
import { useToast } from '@/contexts/ToastContext';
import { PROGRESS_CATEGORIES, PROGRESS_LABELS, type CasePriority, type CaseResultDTO } from '@/types';

type Task = CaseResultDTO & {
  project: { id: string; name: string };
  stage: { id: string; name: string };
  batchScope: { id: string; name: string };
};

const priorityLabel: Record<CasePriority, string> = {
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
};

export default function MyTasksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [overdue, setOverdue] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [renderedAt] = useState(() => Date.now());
  const hasFilters = Boolean(status || priority || overdue);

  const clearFilters = () => {
    setStatus('');
    setPriority('');
    setOverdue('');
    setPage(1);
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (overdue) params.set('overdue', overdue);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    try {
      const data = await fetchJson<{
        tasks: Task[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/api/tasks/my?${params}`);
      setTasks(data.tasks);
      setTotal(data.total);
      setPage(data.page);
      setPageSize(data.pageSize);
    } catch (error) {
      showToast({
        message: error instanceof ApiError ? error.message : '加载待办失败',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [overdue, page, pageSize, priority, showToast, status]);

  useEffect(() => {
    if (user) queueMicrotask(() => void load());
  }, [load, user]);

  return (
    <PageContainer title="我的待办" subtitle={`分配给我的用例 · 共 ${total} 项`}>
      <section className="bento-panel mb-5 p-4 sm:p-5" aria-label="待办筛选">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="状态"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            placeholder="全部状态"
            options={PROGRESS_CATEGORIES.map((value) => ({ value, label: PROGRESS_LABELS[value] }))}
          />
          <Select
            label="优先级"
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value);
              setPage(1);
            }}
            placeholder="全部优先级"
            options={[
              { value: 'HIGH', label: '高' },
              { value: 'MEDIUM', label: '中' },
              { value: 'LOW', label: '低' },
            ]}
          />
          <Select
            label="截止时间"
            value={overdue}
            onChange={(event) => {
              setOverdue(event.target.value);
              setPage(1);
            }}
            placeholder="全部"
            options={[
              { value: 'true', label: '已逾期' },
              { value: 'false', label: '未逾期' },
            ]}
          />
        </div>
        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              清除筛选
            </Button>
          </div>
        )}
      </section>

      {authLoading || loading ? (
        <div className="bento-panel p-10 text-center text-sm text-text-secondary">加载中...</div>
      ) : (
        <div className="bento-panel overflow-hidden">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-bg/50 text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-3">用例</th>
                <th className="px-4 py-3">项目 / 阶段</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">优先级</th>
                <th className="px-4 py-3">截止日期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.map((task) => {
                const overdueTask = !!task.dueDate && new Date(task.dueDate).getTime() < renderedAt;
                return (
                  <tr key={task.id} className="hover:bg-bg/40">
                    <td className="px-4 py-3">
                      <Link href={`/case/${task.id}`} className="font-medium text-accent">
                        {task.caseNo} · {task.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {task.project.name} / {task.stage.name}
                    </td>
                    <td className="px-4 py-3">
                      {task.progressCategory
                        ? PROGRESS_LABELS[task.progressCategory as keyof typeof PROGRESS_LABELS]
                        : '未设置'}
                    </td>
                    <td className="px-4 py-3">
                      {task.priority ? priorityLabel[task.priority] : '—'}
                    </td>
                    <td className={`px-4 py-3 ${overdueTask ? 'font-medium text-danger' : 'text-text-secondary'}`}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
          <div className="divide-y divide-border sm:hidden">
            {tasks.map((task) => {
              const overdueTask = !!task.dueDate && new Date(task.dueDate).getTime() < renderedAt;
              return (
                <Link
                  key={task.id}
                  href={`/case/${task.id}`}
                  className="block p-4 text-text-primary"
                >
                  <p className="text-sm font-semibold">{task.name}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {task.caseNo} · {task.project.name} / {task.stage.name}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="filter-chip">
                      {task.progressCategory
                        ? PROGRESS_LABELS[task.progressCategory as keyof typeof PROGRESS_LABELS]
                        : '未设置'}
                    </span>
                    <span className="filter-chip">
                      优先级 {task.priority ? priorityLabel[task.priority] : '—'}
                    </span>
                    <span className={overdueTask ? 'filter-chip text-danger' : 'filter-chip'}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : '无截止日期'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          {!tasks.length && (
            <EmptyState
              title={hasFilters ? '筛选条件下暂无待办' : '当前没有分配给你的待办'}
              description={
                hasFilters
                  ? '调整或清除筛选条件，查看其他待办任务。'
                  : '新的分析任务分配给你后，会在这里集中显示。'
              }
              actionLabel={hasFilters ? '清除筛选' : undefined}
              onAction={hasFilters ? clearFilters : undefined}
            />
          )}
        </div>
      )}

      {!authLoading && !loading && total > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= Math.ceil(total / pageSize)}
              className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
