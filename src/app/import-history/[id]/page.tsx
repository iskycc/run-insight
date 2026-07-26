'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { fetchJson, ApiError } from '@/lib/fetch';
import type { ImportRecordDetail } from '@/types';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN');
}

function importTypeLabel(t: string) {
  if (t === 'pre-analysis') return '分析前';
  if (t === 'post-analysis') return '分析后';
  return t;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-text-primary">{value}</div>
    </div>
  );
}

function statusBadge(status: ImportRecordDetail['status']) {
  if (status === 'success') return <Badge progress="fixed">成功</Badge>;
  if (status === 'partial') return <Badge progress="analyzing">部分成功</Badge>;
  return <Badge progress="blocked">失败</Badge>;
}

export default function ImportHistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [record, setRecord] = useState<ImportRecordDetail | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'ready' | 'not-found' | 'error'>('idle');
  const [isRollingBack, setIsRollingBack] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    const controller = new AbortController();
    (async () => {
      try {
        const data = await fetchJson<ImportRecordDetail>(`/api/import-history/${id}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRecord(data);
        setLoadState('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setLoadState('not-found');
        } else {
          const message = error instanceof ApiError ? error.message : '加载导入记录失败';
          setLoadState('error');
          showToast({ message, type: 'error' });
        }
      }
    })();
    return () => controller.abort();
  }, [user, id, showToast]);

  const handleBack = useCallback(() => {
    router.push('/import-history');
  }, [router]);

  const handleRollback = useCallback(async () => {
    if (!record?.canRollback || isRollingBack) return;
    if (!window.confirm('确定回滚本次导入吗？导入后已修改的用例会阻止整个回滚。')) return;
    setIsRollingBack(true);
    try {
      const result = await fetchJson<{ rolledBackAt: string }>(
        `/api/import-history/${record.id}/rollback`,
        { method: 'POST' }
      );
      setRecord((current) => current ? {
        ...current,
        rolledBackAt: result.rolledBackAt,
        rolledBackBy: user?.id ?? null,
        canRollback: false,
      } : current);
      showToast({ message: '导入已回滚', type: 'success' });
    } catch (error) {
      showToast({
        message: error instanceof ApiError ? error.message : '回滚导入失败',
        type: 'error',
      });
    } finally {
      setIsRollingBack(false);
    }
  }, [isRollingBack, record, showToast, user?.id]);

  const loading = loadState === 'idle';
  const notFound = loadState === 'not-found';

  if (!user) {
    return (
      <PageContainer title="导入记录详情" subtitle="查看导入记录的详细信息">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-text-secondary">请先登录以查看导入记录</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="导入记录详情"
      subtitle={record ? `${record.fileName} · ${formatDateTime(record.createdAt)}` : '查看导入记录的详细信息'}
      actions={
        <Button variant="secondary" size="sm" onClick={handleBack}>
          返回列表
        </Button>
      }
    >
      {loading ? (
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-text-secondary">加载中...</p>
        </div>
      ) : notFound ? (
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-text-secondary">未找到该导入记录</p>
        </div>
      ) : record ? (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="总行数" value={record.totalRows.toLocaleString('zh-CN')} />
            <Metric label="成功写入" value={record.importedCount.toLocaleString('zh-CN')} />
            <Metric label="错误数" value={record.errorCount.toLocaleString('zh-CN')} />
            <Metric
              label="成功率"
              value={record.totalRows > 0 ? `${Math.round((record.importedCount / record.totalRows) * 100)}%` : '—'}
            />
          </section>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.7fr)]">
          <section className="min-w-0 rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)] sm:p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">Import record</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-primary">导入信息</h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge progress="analyzing">{importTypeLabel(record.importType)}</Badge>
                {statusBadge(record.status)}
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <div className="rounded-xl bg-[#f8faff] p-4">
                <dt className="text-xs text-text-secondary">记录 ID</dt>
                <dd className="mt-1.5 break-all font-mono text-xs text-text-primary">{record.id}</dd>
              </div>
              <div className="rounded-xl bg-[#f8faff] p-4">
                <dt className="text-xs text-text-secondary">项目</dt>
                <dd className="mt-1.5 text-sm font-semibold text-text-primary">{record.projectName}</dd>
              </div>
              <div className="rounded-xl bg-[#f8faff] p-4">
                <dt className="text-xs text-text-secondary">文件名</dt>
                <dd className="mt-1.5 break-words text-sm font-semibold text-text-primary">{record.fileName}</dd>
              </div>
              <div className="rounded-xl bg-[#f8faff] p-4">
                <dt className="text-xs text-text-secondary">导入人</dt>
                <dd className="mt-1.5 text-sm font-semibold text-text-primary">{record.username}</dd>
              </div>
              <div className="rounded-xl bg-[#f8faff] p-4">
                <dt className="text-xs text-text-secondary">导入时间</dt>
                <dd className="mt-1.5 text-sm font-semibold text-text-primary">{formatDateTime(record.createdAt)}</dd>
              </div>
              <div className="rounded-xl bg-[#f8faff] p-4">
                <dt className="text-xs text-text-secondary">回滚状态</dt>
                <dd className="mt-1.5 text-sm font-semibold text-text-primary">
                  {record.rolledBackAt
                    ? `已于 ${formatDateTime(record.rolledBackAt)} 回滚`
                    : '未回滚'}
                </dd>
              </div>
            </dl>
          </section>

          <aside className="rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)] sm:p-6">
            <h2 className="text-lg font-semibold tracking-tight text-text-primary">状态摘要</h2>
            <div className="mt-5 rounded-2xl bg-[#f4f7fc] p-4">
              <p className="text-xs font-medium text-text-secondary">当前状态</p>
              <div className="mt-2">{statusBadge(record.status)}</div>
              <p className="mt-4 text-xs leading-5 text-text-secondary">
                {record.errorCount > 0
                  ? '部分行未写入，可在下方错误明细中定位并修正源文件。'
                  : '所有数据均已完成处理，未记录导入错误。'}
              </p>
            </div>
            {record.canRollback && (
              <div className="mt-5 border-t border-border pt-5">
                <p className="text-xs leading-5 text-text-secondary">
                  回滚会撤销本次新增或更新的数据，且无法自动恢复。
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="danger"
                  size="sm"
                  onClick={handleRollback}
                  disabled={isRollingBack}
                >
                  {isRollingBack ? '回滚中...' : '回滚本次导入'}
                </Button>
              </div>
            )}
          </aside>
          </div>

          {record.errors && record.errors.length > 0 && (
            <section className="overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.07)]">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <h2 className="text-lg font-semibold tracking-tight text-text-primary">错误明细</h2>
                <p className="mt-1 text-xs text-text-secondary">共 {record.errors.length.toLocaleString('zh-CN')} 条校验或写入错误</p>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 bg-[#f8faff] text-left text-xs text-text-secondary">
                    <tr>
                      <th className="px-5 py-3 font-semibold">行号</th>
                      <th className="px-5 py-3 font-semibold">字段</th>
                      <th className="px-5 py-3 font-semibold">错误信息</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {record.errors.map((error, index) => (
                      <tr key={`${error.row}-${error.field}-${index}`}>
                        <td className="px-5 py-3 text-text-primary">{error.row}</td>
                        <td className="px-5 py-3 font-mono text-xs text-accent">{error.field || '—'}</td>
                        <td className="px-5 py-3 text-danger">{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </PageContainer>
  );
}
