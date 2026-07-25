'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/contexts/ToastContext';
import { ApiError, fetchJson } from '@/lib/fetch';
import type { AuditLogDTO, AuditLogsResponse } from '@/types';

const PAGE_SIZE = 50;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN');
}

function formatChanges(changes: unknown): string {
  if (changes === null || changes === undefined) return '';
  try {
    return JSON.stringify(changes, null, 2);
  } catch {
    return String(changes);
  }
}

export default function AdminAuditLogsPage() {
  const { showToast } = useToast();

  const [logs, setLogs] = useState<AuditLogDTO[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageInfo, setPageInfo] = useState<{ page: number; pageSize: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<AuditLogsResponse>(
          `/api/audit-logs?page=${page}&pageSize=${PAGE_SIZE}`,
          { signal: controller.signal },
        );
        if (cancelled || controller.signal.aborted) return;
        setLogs(data.logs);
        setTotal(data.total);
        setPageInfo({ page: data.page, pageSize: data.pageSize });
        setLoadedPage(data.page);
        setErrorMsg(null);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 403) {
          setErrorMsg('权限不足，仅管理员可访问');
        } else if (error instanceof ApiError && error.status === 401) {
          setErrorMsg('请先登录');
        } else {
          setErrorMsg(error instanceof ApiError ? error.message : '加载审计日志失败');
          showToast({
            message: error instanceof ApiError ? error.message : '加载审计日志失败',
            type: 'error',
          });
        }
        setLoadedPage(page);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [page, showToast]);

  const loading = loadedPage !== page;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);
  const goNext = useCallback(() => {
    setPage((p) => (p < totalPages ? p + 1 : p));
  }, [totalPages]);

  if (errorMsg) {
    return (
      <PageContainer title="审计日志" subtitle="查看系统中的操作日志">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-danger">{errorMsg}</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="审计日志" subtitle="查看系统中的操作日志">
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-10">
            <p className="text-sm text-text-secondary">加载中...</p>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title="暂无审计日志" description="尚无任何操作记录" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg/60 text-left text-xs font-semibold text-text-secondary">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">动作</th>
                  <th className="px-4 py-3">实体</th>
                  <th className="px-4 py-3">实体 ID</th>
                  <th className="px-4 py-3">变更</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top hover:bg-bg/40">
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-primary">
                      {log.userId}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{log.action}</td>
                    <td className="px-4 py-3 text-text-secondary">{log.entityType}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {log.entityId}
                    </td>
                    <td className="px-4 py-3">
                      <pre className="max-w-md overflow-auto rounded bg-bg/60 p-2 text-xs text-text-primary">
                        {formatChanges(log.changes)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3">
        <p className="text-xs text-text-secondary">
          共 {total} 条 · 第 {pageInfo?.page ?? page} / {totalPages} 页（每页 {PAGE_SIZE} 条）
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={goPrev}
            disabled={page <= 1 || loading}
          >
            上一页
          </Button>
          <span className="text-xs text-text-secondary">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={goNext}
            disabled={page >= totalPages || loading}
          >
            下一页
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}