'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { fetchJson, ApiError } from '@/lib/fetch';
import type {
  ImportHistoryResponse,
  ImportRecordDTO,
  ImportRecordStatus,
} from '@/types';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN');
}

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
      subtitle="查看历史导入记录与详情"
      actions={
        <Button variant="secondary" size="sm" onClick={handleRefresh}>
          刷新
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="panel grid gap-3 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-text-secondary">项目</span>
            <select
              aria-label="项目筛选"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setPage(1);
              }}
              className="field-control mt-1.5 h-10 w-full px-3 text-sm"
            >
              <option value="">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-text-secondary">状态</span>
            <select
              aria-label="状态筛选"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ImportRecordStatus | '');
                setPage(1);
              }}
              className="field-control mt-1.5 h-10 w-full px-3 text-sm"
            >
              <option value="">全部状态</option>
              <option value="success">成功</option>
              <option value="partial">部分成功</option>
              <option value="failed">失败</option>
            </select>
          </label>
        </div>

        <div className="panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <p className="text-sm text-text-secondary">加载中...</p>
            </div>
          ) : records.length === 0 ? (
            <EmptyState title="暂无导入记录" description="完成一次导入后将显示在这里" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg/60 text-left text-xs font-semibold text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">时间</th>
                    <th className="px-4 py-3">文件名</th>
                    <th className="px-4 py-3">项目</th>
                    <th className="px-4 py-3">导入人</th>
                    <th className="px-4 py-3">导入类型</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3 text-right">总行数</th>
                    <th className="px-4 py-3 text-right">成功</th>
                    <th className="px-4 py-3 text-right">错误数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer hover:bg-bg/40"
                      onClick={() => router.push(`/import-history/${r.id}`)}
                    >
                      <td className="px-4 py-3 text-text-secondary">{formatDateTime(r.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-text-primary">{r.fileName}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {r.projectName}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{r.username}</td>
                      <td className="px-4 py-3">
                        <Badge progress="analyzing">{importTypeLabel(r.importType)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge progress={statusConfig[r.status].progress}>
                          {statusConfig[r.status].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-text-secondary">{r.totalRows}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-success">{r.importedCount}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.errorCount > 0 ? (
                          <span className="text-danger">{r.errorCount}</span>
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
        </div>

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
