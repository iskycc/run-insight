'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CaretDown,
  DownloadSimple,
} from '@phosphor-icons/react';
import { BatchResultEditModal } from '@/components/batch/BatchResultEditModal';
import { BatchResultsTable } from '@/components/batch/BatchResultsTable';
import { PageContainer } from '@/components/layout/PageContainer';
import { Input } from '@/components/shared/Input';
import { LoadingState } from '@/components/shared/LoadingState';
import { Select } from '@/components/shared/Select';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { formatDateTime } from '@/lib/date-time';
import { ApiError, fetchJson } from '@/lib/fetch';
import type {
  BatchResultsSummaryResponse,
  CaseResultDTO,
  CasesResponse,
  ResultSummary,
  UpdateCaseRequest,
} from '@/types';

const RESULT_COLORS: Record<ResultSummary, string> = {
  PASS: 'bg-success',
  FAIL: 'bg-danger',
  BLOCK: 'bg-progress-blocked',
  SKIP: 'bg-text-secondary',
};

function MetricCard({
  label,
  value,
  detail,
  tone = 'text-text-primary',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/80 bg-white px-5 py-4 shadow-[0_12px_34px_rgba(38,57,88,0.055)]">
      <p className="text-xs font-semibold text-text-secondary">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-text-secondary">{detail}</p>
    </div>
  );
}

export default function BatchResultsPage() {
  const params = useParams<{ id: string; batchId: string }>();
  const projectId = params?.id ?? '';
  const batchId = params?.batchId ?? '';
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<BatchResultsSummaryResponse | null>(null);
  const [cases, setCases] = useState<CaseResultDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [resultSummary, setResultSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [casesLoading, setCasesLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingCase, setEditingCase] = useState<CaseResultDTO | null>(null);
  const pageSize = 30;

  const loadSummary = useCallback(async () => {
    const data = await fetchJson<BatchResultsSummaryResponse>(
      `/api/batches/${encodeURIComponent(batchId)}/results`,
    );
    if (data.batch.projectId !== projectId) {
      throw new Error('批跑不属于当前项目');
    }
    setSummary(data);
  }, [batchId, projectId]);

  const loadCases = useCallback(async () => {
    const query = new URLSearchParams({
      batchScopeId: batchId,
      page: String(page),
      pageSize: String(pageSize),
      sortField: 'caseNo',
      sortOrder: 'asc',
    });
    if (search) query.set('search', search);
    if (resultSummary) query.set('resultSummary', resultSummary);
    const data = await fetchJson<CasesResponse>(`/api/cases?${query.toString()}`);
    setCases(data.cases);
    setTotal(data.total);
  }, [batchId, page, resultSummary, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      if (nextSearch === search) return;
      setCasesLoading(true);
      setSearch(nextSearch);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, searchInput]);

  useEffect(() => {
    if (!user || !batchId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void loadSummary()
        .catch((caught) => {
          if (active) {
            setError(caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : '加载批跑失败');
          }
        })
        .finally(() => {
          if (active) setSummaryLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [batchId, loadSummary, user]);

  useEffect(() => {
    if (!user || !batchId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void loadCases()
        .catch((caught) => {
          if (active) {
            setError(caught instanceof ApiError ? caught.message : '加载批跑结果失败');
          }
        })
        .finally(() => {
          if (active) setCasesLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [batchId, loadCases, user]);

  const exportBase = useMemo(() => {
    const query = new URLSearchParams({ batchScopeId: batchId });
    return `/api/export?${query.toString()}`;
  }, [batchId]);

  const handleSave = async (updates: UpdateCaseRequest) => {
    if (!editingCase) return;
    await fetchJson(`/api/cases/${editingCase.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setEditingCase(null);
    await Promise.all([loadSummary(), loadCases()]);
    showToast({ message: '批跑结果已更新', type: 'success' });
  };

  if (authLoading || summaryLoading) {
    return (
      <PageContainer title="批跑结果" subtitle="正在读取批跑与统计信息">
        <div className="panel p-6">
          <LoadingState label="正在加载批跑结果" rows={6} />
        </div>
      </PageContainer>
    );
  }

  if (error || !summary) {
    return (
      <PageContainer title="批跑结果" subtitle="无法读取当前批跑">
        <section className="panel px-6 py-14 text-center">
          <p role="alert" className="text-sm text-danger">{error || '批跑不存在'}</p>
          <Link href={`/projects/${projectId}`} className="mt-4 inline-flex text-sm font-semibold text-accent">
            返回项目详情
          </Link>
        </section>
      </PageContainer>
    );
  }

  const { batch, stats } = summary;
  const resultSegments = (['PASS', 'FAIL', 'BLOCK', 'SKIP'] as const).map((result) => ({
    result,
    count: {
      PASS: stats.passCount,
      FAIL: stats.failCount,
      BLOCK: stats.blockCount,
      SKIP: stats.skipCount,
    }[result],
  }));

  return (
    <PageContainer
      title={`${batch.name} · 批跑结果`}
      subtitle={`${batch.project.name} / ${batch.stage.name} · 执行于 ${formatDateTime(batch.executedAt)}`}
      actions={(
        <>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            返回项目
          </Link>
          <details className="relative">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-white shadow-[0_4px_14px_rgba(17,96,242,0.16)] [&::-webkit-details-marker]:hidden">
              <DownloadSimple size={16} aria-hidden="true" />
              导出全量
              <CaretDown size={14} aria-hidden="true" />
            </summary>
            <div className="dropdown-surface absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-lg">
              <a
                href={`${exportBase}&format=csv`}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg"
              >
                全量 CSV
                <span className="mt-0.5 block text-xs font-normal text-text-secondary">适合大批量结果</span>
              </a>
              <a
                href={`${exportBase}&format=xlsx`}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg"
              >
                Excel 工作簿
                <span className="mt-0.5 block text-xs font-normal text-text-secondary">最多 10,000 行</span>
              </a>
            </div>
          </details>
        </>
      )}
    >
      <div className="space-y-5">
        <section aria-labelledby="batch-result-stats-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="batch-result-stats-title" className="text-lg font-semibold text-text-primary">
                结果统计
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                PASS 与所有非 PASS 结果均计入本批跑统计。
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
              {batch.environment && <span>环境 {batch.environment}</span>}
              {batch.buildVersion && <span>版本 {batch.buildVersion}</span>}
              {batch.archived && <span className="font-semibold text-warning">批跑已归档</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <MetricCard label="全部结果" value={stats.totalCount.toLocaleString()} detail="本批跑执行总数" />
            <MetricCard label="通过率" value={`${stats.passRate}%`} detail={`${stats.passCount} 条 PASS`} tone="text-success" />
            <MetricCard label="非 PASS" value={stats.nonPassCount.toLocaleString()} detail="需关注结果总数" tone="text-danger" />
            <MetricCard label="失败" value={stats.failCount.toLocaleString()} detail="FAIL" tone="text-danger" />
            <MetricCard label="阻塞" value={stats.blockCount.toLocaleString()} detail="BLOCK" tone="text-progress-blocked" />
            <MetricCard label="跳过" value={stats.skipCount.toLocaleString()} detail="SKIP" tone="text-text-secondary" />
          </div>

          <div className="rounded-[18px] border border-white/80 bg-white p-5 shadow-[0_12px_34px_rgba(38,57,88,0.055)]">
            <div className="flex h-3 overflow-hidden rounded-full bg-bg">
              {stats.totalCount > 0 && resultSegments.map(({ result, count }) => (
                count > 0 && (
                  <span
                    key={result}
                    className={RESULT_COLORS[result]}
                    style={{ width: `${(count / stats.totalCount) * 100}%` }}
                    title={`${result}: ${count}`}
                  />
                )
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {resultSegments.map(({ result, count }) => (
                <span key={result} className="inline-flex items-center gap-2 text-xs text-text-secondary">
                  <span className={`h-2 w-2 rounded-full ${RESULT_COLORS[result]}`} />
                  {result} {count.toLocaleString()}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[18px] border border-white/80 bg-white p-4 shadow-[0_12px_34px_rgba(38,57,88,0.055)]">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <Input
              type="search"
              aria-label="搜索批跑结果"
              value={searchInput}
              placeholder="搜索用例编号或名称"
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <Select
              aria-label="筛选执行结果"
              value={resultSummary}
              placeholder="全部执行结果"
              onValueChange={(value) => {
                setCasesLoading(true);
                setResultSummary(value);
                setPage(1);
              }}
              options={[
                { value: 'PASS', label: 'PASS · 通过' },
                { value: 'FAIL', label: 'FAIL · 失败' },
                { value: 'BLOCK', label: 'BLOCK · 阻塞' },
                { value: 'SKIP', label: 'SKIP · 跳过' },
              ]}
            />
          </div>
        </section>

        {casesLoading ? (
          <div className="panel p-6">
            <LoadingState label="正在筛选批跑结果" rows={6} />
          </div>
        ) : (
          <BatchResultsTable
            cases={cases}
            total={total}
            page={page}
            pageSize={pageSize}
            canEdit={summary.canEdit}
            onPageChange={(nextPage) => {
              setCasesLoading(true);
              setPage(nextPage);
            }}
            onEdit={setEditingCase}
          />
        )}
      </div>

      {editingCase && (
        <BatchResultEditModal
          key={editingCase.id}
          caseData={editingCase}
          open
          onClose={() => setEditingCase(null)}
          onSave={handleSave}
        />
      )}
    </PageContainer>
  );
}
