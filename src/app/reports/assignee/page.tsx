'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
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
type ChartMetric = 'failCount' | 'totalCases' | 'fixCount';

const CHART_METRIC_LABELS: Record<ChartMetric, string> = {
  failCount: '失败用例数',
  totalCases: '用例总数',
  fixCount: '已修复数',
};

const SORT_FIELD_LABELS: Record<SortField, string> = {
  assignee: '责任人',
  totalCases: '用例总数',
  failCount: '失败数',
  fixCount: '修复数',
  savedAssetCount: '已保存资产',
  fixRate: '修复率',
};

interface FilterOptions {
  projects: { value: string; label: string }[];
  stages: { value: string; label: string }[];
  batches: { value: string; label: string }[];
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
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
  const [chartMetric, setChartMetric] = useState<ChartMetric>('failCount');

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

  const rankedStats = useMemo(() => {
    return [...stats]
      .filter((s) => s[chartMetric] > 0)
      .sort((a, b) => b[chartMetric] - a[chartMetric])
      .slice(0, 10);
  }, [stats, chartMetric]);

  const summary = useMemo(() => {
    const totalCases = stats.reduce((sum, row) => sum + row.totalCases, 0);
    const failCount = stats.reduce((sum, row) => sum + row.failCount, 0);
    const fixCount = stats.reduce((sum, row) => sum + row.fixCount, 0);
    const assetCount = stats.reduce((sum, row) => sum + row.savedAssetCount, 0);
    return {
      totalCases,
      failCount,
      fixCount,
      assetCount,
      aggregateFixRate: failCount > 0
        ? Math.min(100, Math.round((fixCount / failCount) * 100))
        : 0,
    };
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
    if (sortField !== field) return null;
    return sortOrder === 'asc'
      ? <CaretUp size={12} weight="bold" aria-hidden="true" />
      : <CaretDown size={12} weight="bold" aria-hidden="true" />;
  }, [sortField, sortOrder]);

  const workspaceHref = useCallback((assigneeName: string) => {
    const params = new URLSearchParams({ assignee: assigneeName });
    if (projectId) params.set('projectId', projectId);
    if (stageId) params.set('testStageId', stageId);
    if (batchScopeId) params.set('batchScopeId', batchScopeId);
    return `/workspace?${params.toString()}`;
  }, [projectId, stageId, batchScopeId]);

  const csvHref = useMemo(() => {
    const header = ['责任人', '总用例数', '失败数', '修复数', '已保存资产', '修复率'];
    const rows = sortedStats.map((row) => [
      row.assignee,
      row.totalCases,
      row.failCount,
      row.fixCount,
      row.savedAssetCount,
      `${(row.fixRate * 100).toFixed(0)}%`,
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }, [sortedStats]);

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
    <PageContainer
      title="责任人报告"
      subtitle={`聚合 ${stats.length.toLocaleString()} 位责任人的用例质量、修复与资产沉淀`}
    >
      <div className="space-y-5">
        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_16px_48px_rgba(38,57,88,0.08)] backdrop-blur-xl sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold tracking-tight text-text-primary">报告范围</h2>
            <p className="mt-0.5 text-xs text-text-secondary">选择项目后可继续收窄到测试阶段和批跑范围</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
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
        </section>

        <section aria-label="责任人报告摘要" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: '覆盖责任人', value: stats.length, suffix: '人', tone: 'text-text-primary' },
            { label: '失败用例', value: summary.failCount, suffix: '条', tone: 'text-danger' },
            { label: '已修复', value: summary.fixCount, suffix: '条', tone: 'text-success' },
            { label: '整体修复率', value: summary.aggregateFixRate, suffix: '%', tone: 'text-accent' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[20px] border border-white/80 bg-white/90 p-4 shadow-[0_10px_32px_rgba(38,57,88,0.06)] sm:p-5"
            >
              <p className="text-xs font-medium text-text-secondary">{item.label}</p>
              <p className={`mt-2 text-2xl font-semibold tracking-tight ${item.tone}`}>
                {item.value.toLocaleString()}
                <span className="ml-1 text-xs font-medium text-text-secondary">{item.suffix}</span>
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_16px_48px_rgba(38,57,88,0.08)] backdrop-blur-xl sm:p-5">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold tracking-tight text-text-primary">
                <span>Top 10 {CHART_METRIC_LABELS[chartMetric]}</span>
                <span className="rounded-full bg-accent/8 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  当前展示 {rankedStats.length} 人
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                最多展示 10 位责任人，条形长度代表当前指标值
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
              <span>图表指标</span>
              <Select
                aria-label="图表指标"
                value={chartMetric}
                onChange={(event) => setChartMetric(event.target.value as ChartMetric)}
                className="h-9 min-w-32 rounded-xl bg-white px-3 text-xs font-semibold text-text-primary"
                options={(Object.keys(CHART_METRIC_LABELS) as ChartMetric[]).map((metric) => ({
                  value: metric,
                  label: CHART_METRIC_LABELS[metric],
                }))}
              />
            </div>
          </div>

          <div style={{ height: Math.max(260, rankedStats.length * 44) }}>
            {rankedStats.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rankedStats}
                  layout="vertical"
                  margin={{ top: 4, right: 28, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="var(--color-border)"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="assignee"
                    width={96}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'var(--color-text-primary)' }}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [
                      Number(value).toLocaleString(),
                      CHART_METRIC_LABELS[chartMetric],
                    ]}
                    contentStyle={{
                      borderRadius: 14,
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 12px 32px rgba(38,57,88,0.12)',
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey={chartMetric}
                    name={CHART_METRIC_LABELS[chartMetric]}
                    fill="var(--color-accent)"
                    radius={[0, 8, 8, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-white/80 bg-white/90 shadow-[0_16px_48px_rgba(38,57,88,0.08)] backdrop-blur-xl">
          <div className="flex flex-col justify-between gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-text-primary">
                责任人统计（{stats.length} 人）
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                点击列标题排序；当前按{SORT_FIELD_LABELS[sortField]}{sortOrder === 'asc' ? '升序' : '降序'}
              </p>
            </div>
            <a
              href={csvHref}
              download="assignee-stats.csv"
              aria-disabled={sortedStats.length === 0}
              onClick={(event) => {
                if (sortedStats.length === 0) event.preventDefault();
              }}
              className={`inline-flex h-9 items-center justify-center rounded-xl border border-border/80 bg-white px-3 text-xs font-semibold transition-colors ${
                sortedStats.length === 0
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:border-accent/30 hover:bg-accent/5'
              }`}
            >
              导出 CSV
            </a>
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
                <thead className="bg-bg/40 text-left text-xs text-text-secondary">
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
                <tbody className="divide-y divide-border/70">
                  {sortedStats.map((row) => (
                    <tr key={row.assignee} className="transition-colors hover:bg-bg/40">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={workspaceHref(row.assignee)}
                          className="text-accent hover:underline"
                          aria-label={`查看 ${row.assignee} 的用例`}
                        >
                          {row.assignee}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.totalCases}</td>
                      <td className="px-4 py-3 font-medium text-text-primary">{row.failCount}</td>
                      <td className="px-4 py-3 font-medium text-success">{row.fixCount}</td>
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
        </section>
      </div>
    </PageContainer>
  );
}
