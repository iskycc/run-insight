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
    <div className="panel-muted rounded-md px-4 py-3">
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="mt-1 text-base font-semibold text-text-primary">{value}</div>
    </div>
  );
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
        <div className="flex gap-2">
          {record?.canRollback && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleRollback}
              disabled={isRollingBack}
            >
              {isRollingBack ? '回滚中...' : '回滚本次导入'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleBack}>
            返回列表
          </Button>
        </div>
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
        <div className="space-y-4">
          <section className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">基础信息</h2>
              <Badge progress="analyzing">{importTypeLabel(record.importType)}</Badge>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-text-secondary">记录 ID</dt>
                <dd className="mt-1 text-sm text-text-primary break-all">{record.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">项目</dt>
                <dd className="mt-1 text-sm text-text-primary">{record.projectName}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">文件名</dt>
                <dd className="mt-1 text-sm text-text-primary">{record.fileName}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">导入人</dt>
                <dd className="mt-1 text-sm text-text-primary">{record.username}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">导入时间</dt>
                <dd className="mt-1 text-sm text-text-primary">{formatDateTime(record.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">回滚状态</dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {record.rolledBackAt
                    ? `已于 ${formatDateTime(record.rolledBackAt)} 回滚`
                    : '未回滚'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Metric label="总行数" value={record.totalRows} />
            <Metric label="成功" value={record.importedCount} />
            <Metric label="错误数" value={record.errorCount} />
          </section>

          {record.errors && record.errors.length > 0 && (
            <section className="panel p-5">
              <h2 className="mb-3 text-base font-semibold text-text-primary">错误明细</h2>
              <pre className="max-h-96 overflow-auto rounded-md bg-bg/60 p-3 text-xs text-text-primary">
                {JSON.stringify(record.errors, null, 2)}
              </pre>
            </section>
          )}
        </div>
      ) : null}
    </PageContainer>
  );
}
