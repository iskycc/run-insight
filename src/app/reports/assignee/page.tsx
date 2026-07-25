'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { PageContainer } from '@/components/layout/PageContainer';
import { Select } from '@/components/shared/Select';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { fetchJson, ApiError } from '@/lib/fetch';
import type {
  AssigneeStat, AssigneeStatsResponse,
  ProjectsResponse, ProjectDTO,
  StagesResponse, TestStageDTO,
  BatchesResponse, BatchScopeDTO,
} from '@/types';

type SortField = 'assignee' | 'totalCases' | 'failCount' | 'fixCount' | 'savedAssetCount' | 'fixRate';
type SortOrder = 'asc' | 'desc';

interface FilterOptions {
  projects: { value: string; label: string }[];
  stages: { value: string; label: string }[];
  batches: { value: string; label: string }[];
}

export default function AssigneeReportPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    projects: [],
    stages: [],
    batches: [],
  });
  const [projectId, setProjectId] = useState('');
  const [stageId, setStageId] = useState('');
  const [batchScopeId, setBatchScopeId] = useState('');

  const [stats, setStats] = useState<AssigneeStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>('failCount');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Load projects once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson<ProjectsResponse>('/api/projects');
        if (cancelled) return;
        setFilterOptions((prev) => ({
          ...prev,
          projects: data.projects.map((p: ProjectDTO) => ({ value: p.id, label: p.name })),
        }));
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof ApiError ? error.message : '加载项目失败';
        showToast({ message: msg, type: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  const handleProjectChange = useCallback(async (pid: string) => {
    setProjectId(pid);
    setStageId('');
    setBatchScopeId('');
    if (!pid) {
      setFilterOptions((prev) => ({ ...prev, stages: [], batches: [] }));
      return;
    }
    try {
      const data = await fetchJson<StagesResponse>(`/api/projects/${pid}/stages`);
      setFilterOptions((prev) => ({
        ...prev,
        stages: data.stages.map((s: TestStageDTO) => ({ value: s.id, label: s.name })),
        batches: [],
      }));
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : '加载阶段失败';
      showToast({ message: msg, type: 'error' });
    }
  }, [showToast]);

  const handleStageChange = useCallback(async (sid: string) => {
    setStageId(sid);
    setBatchScopeId('');
    if (!sid) {
      setFilterOptions((prev) => ({ ...prev, batches: [] }));
      return;
    }
    try {
      const data = await fetchJson<BatchesResponse>(`/api/stages/${sid}/batches`);
      setFilterOptions((prev) => ({
        ...prev,
        batches: data.batches.map((b: BatchScopeDTO) => ({ value: b.id, label: b.name })),
      }));
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : '加载批跑失败';
      showToast({ message: msg, type: 'error' });
    }
  }, [showToast]);

  // Fetch assignee stats when filters change
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadStats() {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (stageId) params.set('testStageId', stageId);
      if (batchScopeId) params.set('batchScopeId', batchScopeId);
      setLoading(true);
      try {
        const data = await fetchJson<AssigneeStatsResponse>(`/api/stats/assignee?${params.toString()}`);
        if (cancelled) return;
        setStats(data.stats);
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof ApiError ? error.message : '加载责任人统计失败';
        showToast({ message: msg, type: 'error' });
        setStats([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStats();

    return () => { cancelled = true; };
  }, [user, projectId, stageId, batchScopeId, showToast]);

  const sortedStats = useMemo(() => {
    const copy = [...stats];
    copy.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [stats, sortField, sortOrder]);

  const topFailStats = useMemo(() => {
    return [...stats]
      .filter((s) => s.failCount > 0)
      .sort((a, b) => b.failCount - a.failCount)
      .slice(0, 10);
  }, [stats]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'assignee' ? 'asc' : 'desc');
    }
  }, [sortField]);

  const sortIndicator = useCallback((field: SortField) => {
    if (sortField !== field) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  }, [sortField, sortOrder]);

  if (!user) {
    return (
      <PageContainer title="责任人报告" subtitle="按责任人统计用例分布与修复率">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-text-secondary">请先登录以查看责任人报告</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="责任人报告" subtitle="按责任人聚合用例数、失败、修复和资产沉淀情况">
      <div className="space-y-6">
        {/* Filters */}
        <div className="panel grid gap-4 p-4 sm:grid-cols-3">
          <Select
            label="项目"
            placeholder="全部项目"
            options={filterOptions.projects}
            value={projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
          />
          <Select
            label="测试阶段"
            placeholder="全部阶段"
            options={filterOptions.stages}
            value={stageId}
            onChange={(e) => handleStageChange(e.target.value)}
            disabled={!projectId}
          />
          <Select
            label="批跑范围"
            placeholder="全部范围"
            options={filterOptions.batches}
            value={batchScopeId}
            onChange={(e) => setBatchScopeId(e.target.value)}
            disabled={!stageId}
          />
        </div>

        {/* Chart */}
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Top 10 失败用例数</h3>
            <span className="text-xs text-text-secondary">仅展示有失败的责任人</span>
          </div>
          <div className="h-72">
            {topFailStats.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topFailStats} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="assignee"
                    angle={-25}
                    textAnchor="end"
                    height={60}
                    interval={0}
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [Number(value).toLocaleString(), '失败用例数']}
                    contentStyle={{
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="failCount" name="失败用例数" radius={[4, 4, 0, 0]}>
                    {topFailStats.map((entry, idx) => (
                      <Cell
                        key={entry.assignee}
                        fill={idx === 0 ? 'var(--color-danger)' : 'var(--color-accent)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border bg-bg/60 px-4 py-3 text-xs font-semibold text-text-secondary">
            责任人统计（{stats.length} 人）
          </div>
          {loading ? (
            <div className="flex items-center justify-center p-10 text-sm text-text-secondary">
              加载中...
            </div>
          ) : sortedStats.length === 0 ? (
            <EmptyState
              title="暂无数据"
              description="调整项目/阶段/批跑范围筛选，或先分配一些用例责任人。"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg/60 text-left text-xs text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleSort('assignee')}
                        className="font-semibold hover:text-text-primary"
                      >
                        责任人{sortIndicator('assignee')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleSort('totalCases')}
                        className="font-semibold hover:text-text-primary"
                      >
                        总用例数{sortIndicator('totalCases')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleSort('failCount')}
                        className="font-semibold hover:text-text-primary"
                      >
                        失败数{sortIndicator('failCount')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleSort('fixCount')}
                        className="font-semibold hover:text-text-primary"
                      >
                        修复数{sortIndicator('fixCount')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleSort('savedAssetCount')}
                        className="font-semibold hover:text-text-primary"
                      >
                        已保存资产{sortIndicator('savedAssetCount')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleSort('fixRate')}
                        className="font-semibold hover:text-text-primary"
                      >
                        修复率{sortIndicator('fixRate')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedStats.map((row) => (
                    <tr key={row.assignee} className="hover:bg-bg/40">
                      <td className="px-4 py-3 font-medium text-text-primary">{row.assignee}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.totalCases}</td>
                      <td className="px-4 py-3 text-danger">{row.failCount}</td>
                      <td className="px-4 py-3 text-success">{row.fixCount}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.savedAssetCount}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.fixRate === 0 ? '0%' : `${(row.fixRate * 100).toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}