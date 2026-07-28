'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { Input } from '@/components/shared/Input';
import { Select } from '@/components/shared/Select';
import { LoadingState } from '@/components/shared/LoadingState';
import { useToast } from '@/contexts/ToastContext';
import { formatDateTime, toDateInputValue } from '@/lib/date-time';
import { ApiError, fetchJson } from '@/lib/fetch';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_TYPES,
  AUDIT_ENTITY_TYPE_LABELS,
} from '@/types';
import type {
  AuditAction,
  AuditEntityType,
  AuditLogDTO,
  AuditLogsResponse,
  UserWithRole,
  UsersResponse,
} from '@/types';

const PAGE_SIZE = 50;

const ACTION_OPTIONS = [
  { value: '', label: '全部动作' },
  ...AUDIT_ACTIONS.map((action) => ({
    value: action,
    label: AUDIT_ACTION_LABELS[action],
  })),
];

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: '全部实体' },
  ...AUDIT_ENTITY_TYPES.map((entityType) => ({
    value: entityType,
    label: AUDIT_ENTITY_TYPE_LABELS[entityType],
  })),
];

interface AuditFilters {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: AuditFilters = {
  userId: '',
  action: '',
  entityType: '',
  entityId: '',
  dateFrom: '',
  dateTo: '',
};

function formatChanges(changes: unknown): string {
  if (changes === null || changes === undefined) return '';
  try {
    return JSON.stringify(changes, null, 2);
  } catch {
    return String(changes);
  }
}

function buildSearchParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

export default function AdminAuditLogsPage() {
  const { showToast } = useToast();

  const [logs, setLogs] = useState<AuditLogDTO[]>([]);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageInfo, setPageInfo] = useState<{ page: number; pageSize: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadedRequest, setLoadedRequest] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const requestQuery = useMemo(() => {
    const params = buildSearchParams(filters);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    return params.toString();
  }, [filters, page]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<UsersResponse>('/api/users');
        if (!cancelled) setUsers(data.users);
      } catch {
        if (!cancelled) {
          showToast({ message: '用户筛选选项加载失败', type: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchJson<AuditLogsResponse>(
          `/api/audit-logs?${requestQuery}`,
          { signal: controller.signal },
        );
        if (cancelled || controller.signal.aborted) return;
        setLogs(data.logs);
        setTotal(data.total);
        setPageInfo({ page: data.page, pageSize: data.pageSize });
        setErrorMsg(null);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 403) {
          setErrorMsg('权限不足，仅管理员可访问');
        } else if (error instanceof ApiError && error.status === 401) {
          setErrorMsg('请先登录');
        } else {
          const message = error instanceof ApiError ? error.message : '加载审计日志失败';
          setErrorMsg(message);
          showToast({ message, type: 'error' });
        }
      } finally {
        if (!cancelled && !controller.signal.aborted) setLoadedRequest(requestQuery);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestQuery, showToast]);

  const loading = loadedRequest !== requestQuery;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportHref = useMemo(() => {
    const params = buildSearchParams(filters);
    params.set('format', 'csv');
    return `/api/audit-logs?${params.toString()}`;
  }, [filters]);

  const updateDraftFilter = useCallback((key: keyof AuditFilters, value: string) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const applyFilters = useCallback(() => {
    if (draftFilters.dateFrom && draftFilters.dateTo
      && draftFilters.dateFrom > draftFilters.dateTo) {
      showToast({ message: '开始日期不能晚于结束日期', type: 'error' });
      return;
    }
    setPage(1);
    setFilters({ ...draftFilters });
  }, [draftFilters, showToast]);

  const clearFilters = useCallback(() => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const setRecentDays = useCallback((days: number) => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    setDraftFilters((current) => ({
      ...current,
      dateFrom: toDateInputValue(from),
      dateTo: toDateInputValue(to),
    }));
  }, []);

  const toggleDetails = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const goNext = useCallback(() => {
    setPage((current) => (current < totalPages ? current + 1 : current));
  }, [totalPages]);

  const userOptions = useMemo(
    () => [
      { value: '', label: '全部用户' },
      ...users.map((user) => ({ value: user.id, label: user.username })),
    ],
    [users],
  );

  return (
    <PageContainer
      title="审计日志"
      subtitle="查看系统中的操作日志"
      actions={(
        <a
          href={exportHref}
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-bg px-4 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:bg-surface-solid"
        >
          导出 CSV
        </a>
      )}
    >
      <section className="bento-panel p-4 sm:p-5" aria-label="审计日志筛选">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold text-text-secondary">快捷范围</span>
          <button
            type="button"
            className="filter-chip hover:border-accent/25 hover:text-accent"
            onClick={() => setRecentDays(7)}
          >
            近 7 天
          </button>
          <button
            type="button"
            className="filter-chip hover:border-accent/25 hover:text-accent"
            onClick={() => setRecentDays(30)}
          >
            近 30 天
          </button>
          <button
            type="button"
            className="filter-chip hover:border-accent/25 hover:text-accent"
            onClick={clearFilters}
          >
            全部时间
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Select
            label="用户"
            aria-label="用户"
            options={userOptions}
            value={draftFilters.userId}
            onChange={(event) => updateDraftFilter('userId', event.target.value)}
          />
          <Select
            label="动作"
            aria-label="动作"
            options={ACTION_OPTIONS}
            value={draftFilters.action}
            onChange={(event) => updateDraftFilter('action', event.target.value)}
          />
          <Select
            label="实体类型"
            aria-label="实体类型"
            options={ENTITY_TYPE_OPTIONS}
            value={draftFilters.entityType}
            onChange={(event) => updateDraftFilter('entityType', event.target.value)}
          />
          <Input
            label="实体 ID"
            aria-label="实体 ID"
            placeholder="输入精确 ID"
            value={draftFilters.entityId}
            onChange={(event) => updateDraftFilter('entityId', event.target.value.trim())}
          />
          <Input
            label="开始日期"
            aria-label="开始日期"
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            pattern="\d{4}-\d{2}-\d{2}"
            value={draftFilters.dateFrom}
            onChange={(event) => updateDraftFilter('dateFrom', event.target.value)}
          />
          <Input
            label="结束日期"
            aria-label="结束日期"
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            pattern="\d{4}-\d{2}-\d{2}"
            value={draftFilters.dateTo}
            onChange={(event) => updateDraftFilter('dateTo', event.target.value)}
          />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={clearFilters}>
            清除筛选
          </Button>
          <Button size="sm" onClick={applyFilters}>
            应用筛选
          </Button>
        </div>
      </section>

      {errorMsg ? (
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-danger">{errorMsg}</p>
        </div>
      ) : (
        <div className="bento-panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <LoadingState label="正在加载审计日志" rows={5} />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="暂无审计日志"
              description={
                Object.values(filters).some(Boolean)
                  ? '当前筛选条件下没有操作记录，可以清除筛选查看全部日志。'
                  : '系统产生管理操作后，会在这里记录用户、时间和变更详情。'
              }
              actionLabel={Object.values(filters).some(Boolean) ? '清除筛选' : undefined}
              onAction={Object.values(filters).some(Boolean) ? clearFilters : undefined}
            />
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
                    <th className="px-4 py-3">变更详情</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => {
                    const changes = formatChanges(log.changes);
                    const expanded = expandedIds.has(log.id);
                    return (
                      <tr key={log.id} className="align-top hover:bg-bg/40">
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          <p className="font-medium">{log.username || log.userId}</p>
                          <p className="font-mono text-xs text-text-secondary">{log.userId}</p>
                        </td>
                        <td className="px-4 py-3 text-text-primary" title={log.action}>
                          {AUDIT_ACTION_LABELS[log.action as AuditAction] ?? log.action}
                        </td>
                        <td className="px-4 py-3 text-text-secondary" title={log.entityType}>
                          {AUDIT_ENTITY_TYPE_LABELS[log.entityType as AuditEntityType] ?? log.entityType}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                          {log.entityId}
                        </td>
                        <td className="px-4 py-3">
                          {changes ? (
                            <>
                              <button
                                type="button"
                                className="text-xs font-medium text-accent hover:underline"
                                aria-expanded={expanded}
                                onClick={() => toggleDetails(log.id)}
                              >
                                {expanded ? '收起详情' : '查看详情'}
                              </button>
                              {expanded && (
                                <pre className="mt-2 max-w-md overflow-auto rounded bg-bg/60 p-2 text-xs text-text-primary">
                                  {changes}
                                </pre>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-text-secondary">无变更详情</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
