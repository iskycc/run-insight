'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { Select } from '@/components/shared/Select';
import { Badge } from '@/components/shared/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { formatDateTime } from '@/lib/date-time';
import { fetchJson, ApiError } from '@/lib/fetch';
import type {
  ImportHistoryResponse,
  ImportRecordDTO,
  ImportRecordStatus,
} from '@/types';

function importTypeLabel(t: string) {
  if (t === 'pre-analysis') return '分析前';
  if (t === 'post-analysis') return '分析后';
  return t;
}

const statusConfig: Record<
  ImportRecordStatus,
  { label: string; progress: 'fixed' | 'analyzing' | 'blocked' }
> = {
  success: { label: '成功', progress: 'fixed' },
  partial: { label: '部分成功', progress: 'analyzing' },
  failed: { label: '失败', progress: 'blocked' },
};

export default function ImportHistoryPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [records, setRecords] = useState<ImportRecordDTO[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<ImportRecordStatus | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'ready' | 'error'>('idle');
  const [reloadKey, setReloadKey] = useState(0);

  const pageSize = 20;

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (projectId) params.set('projectId', projectId);
        if (status) params.set('status', status);
        const data = await fetchJson<ImportHistoryResponse>(
          `/api/import-history?${params.toString()}`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setRecords(data.records);
        setProjects(data.projects);
        setTotal(data.total);
        setLoadState('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : '加载导入历史失败';
        setLoadState('error');
        showToast({ message, type: 'error' });
      }
    })();
    return () => controller.abort();
  }, [user, page, projectId, status, reloadKey, showToast]);

  const handleRefresh = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const handleStartImport = useCallback(() => {
    router.push('/import');
  }, [router]);

  const loading = loadState === 'idle';
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!user) {
    return (
      <PageContainer title="导入历史" subtitle="查看历史导入记录与详情">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-text-secondary">请先登录以查看导入历史</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="导入历史"
      subtitle="追踪每次数据写入的状态、结果与错误明细"
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={handleRefresh}>
            刷新
          </Button>
          <Button size="sm" onClick={handleStartImport}>
            新建导入
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <Select
            label="项目"
            aria-label="项目筛选"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: '全部项目' },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
          <Select
            label="状态"
            aria-label="状态筛选"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ImportRecordStatus | '');
              setPage(1);
            }}
            options={[
              { value: '', label: '全部状态' },
              { value: 'success', label: '成功' },
              { value: 'partial', label: '部分成功' },
              { value: 'failed', label: '失败' },
            ]}
          />
          {(projectId || status) && (
            <Button
              variant="secondary"
              onClick={() => {
                setProjectId('');
                setStatus('');
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          )}
        </section>

        <section className="overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-text-primary">导入记录</h2>
              <p className="mt-1 text-xs text-text-secondary">
                {total > 0 ? `共 ${total.toLocaleString('zh-CN')} 条记录` : '按时间倒序显示最近导入'}
              </p>
            </div>
            {(projectId || status) && (
              <span className="rounded-full bg-accent/8 px-3 py-1.5 text-xs font-semibold text-accent">
                已应用筛选
              </span>
            )}
          </div>
          {loading ? (
            <div className="flex min-h-72 items-center justify-center p-10">
              <LoadingState label="正在加载导入历史" rows={5} />
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              title={projectId || status ? '没有匹配的导入记录' : '还没有导入记录'}
              description={projectId || status ? '可以调整或清除筛选条件后重试' : '完成第一次导入后，状态和错误明细会显示在这里'}
              actionLabel={projectId || status ? '清除筛选' : '开始导入'}
              onAction={() => {
                if (projectId || status) {
                  setProjectId('');
                  setStatus('');
                  setPage(1);
                } else {
                  handleStartImport();
                }
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f8faff] text-left text-xs font-semibold text-text-secondary">
                  <tr>
                    <th className="hidden px-4 py-3 lg:table-cell">时间</th>
                    <th className="px-4 py-3">文件名</th>
                    <th className="px-4 py-3">项目</th>
                    <th className="hidden px-4 py-3 xl:table-cell">导入人</th>
                    <th className="hidden px-4 py-3 lg:table-cell">导入类型</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="hidden px-4 py-3 text-right sm:table-cell">总行数</th>
                    <th className="hidden px-4 py-3 text-right md:table-cell">成功</th>
                    <th className="px-4 py-3 text-right">错误数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      className="cursor-pointer outline-none transition-colors hover:bg-[#f8faff] focus-visible:bg-accent/5"
                      onClick={() => router.push(`/import-history/${r.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') router.push(`/import-history/${r.id}`);
                      }}
                    >
                      <td className="hidden whitespace-nowrap px-4 py-3 text-text-secondary lg:table-cell">{formatDateTime(r.createdAt)}</td>
                      <td className="max-w-40 truncate px-4 py-3 font-medium text-text-primary sm:max-w-56">{r.fileName}</td>
                      <td className="max-w-32 truncate px-4 py-3 text-text-secondary">
                        {r.projectName}
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary xl:table-cell">{r.username}</td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <Badge progress="analyzing">{importTypeLabel(r.importType)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge progress={statusConfig[r.status].progress}>
                          {statusConfig[r.status].label}
                        </Badge>
                      </td>
                      <td className="hidden px-4 py-3 text-right text-text-secondary sm:table-cell">{r.totalRows.toLocaleString('zh-CN')}</td>
                      <td className="hidden px-4 py-3 text-right md:table-cell">
                        <span className="text-success">{r.importedCount.toLocaleString('zh-CN')}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.errorCount > 0 ? (
                          <span className="text-danger">{r.errorCount.toLocaleString('zh-CN')}</span>
                        ) : (
                          <span className="text-text-secondary">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {total > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-secondary">
              共 {total} 条记录 · 第 {page} / {totalPages} 页
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
