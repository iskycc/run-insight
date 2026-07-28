'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { Select } from '@/components/shared/Select';
import { Textarea } from '@/components/shared/Textarea';
import { formatDateTime } from '@/lib/date-time';
import { ApiError, fetchJson } from '@/lib/fetch';
import type {
  AssetDTO,
  AssetStatus,
  AssetVersionDetailResponse,
  AssetVersionDTO,
  AssetVersionsResponse,
  RootCauseCategoriesResponse,
  RootCauseCategoryDTO,
} from '@/types';

const STATUS_LABELS: Record<AssetStatus, string> = {
  DRAFT: '草稿',
  REVIEW: '待审核',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

type Props = {
  asset: AssetDTO;
  onClose: () => void;
  onUpdated: (asset: AssetDTO) => void;
};

export function AssetDetail({ asset, onClose, onUpdated }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(asset.title);
  const [summary, setSummary] = useState(asset.summary);
  const [solution, setSolution] = useState(asset.solution);
  const [rootCauseText, setRootCauseText] = useState(asset.rootCauseText ?? '');
  const [rootCauseCategoryId, setRootCauseCategoryId] = useState(
    asset.rootCauseCategoryId ?? ''
  );
  const [tags, setTags] = useState(asset.tags.join(', '));
  const [categories, setCategories] = useState<RootCauseCategoryDTO[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [versions, setVersions] = useState<AssetVersionDTO[]>([]);
  const [versionDetail, setVersionDetail] =
    useState<AssetVersionDetailResponse | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);

  useEffect(() => {
    void fetchJson<RootCauseCategoriesResponse>(
      `/api/root-cause-categories?projectId=${encodeURIComponent(asset.projectId)}`
    ).then((data) => setCategories(data.categories)).catch(() => undefined);
  }, [asset.projectId]);

  useEffect(() => {
    if (!asset.canEdit) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setVersionsLoading(true);
      void fetchJson<AssetVersionsResponse>(
        `/api/assets/${asset.id}/versions`,
        { signal: controller.signal, cache: 'no-store' },
      )
        .then((data) => {
          if (!controller.signal.aborted) setVersions(data.versions);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError('加载版本历史失败');
        })
        .finally(() => {
          if (!controller.signal.aborted) setVersionsLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [asset.canEdit, asset.id, asset.version]);

  const update = async (body: Record<string, unknown>) => {
    const data = await fetchJson<{ asset: AssetDTO }>(`/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    onUpdated(data.asset);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await update({
        title,
        summary,
        solution,
        rootCauseText: rootCauseText || null,
        rootCauseCategoryId: rootCauseCategoryId || null,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      setEditOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '保存资产失败');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: AssetStatus) => {
    setSaving(true);
    setError('');
    try {
      await update({ status });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '更新资产状态失败');
    } finally {
      setSaving(false);
    }
  };

  const showVersion = async (version: number) => {
    setError('');
    try {
      const detail = await fetchJson<AssetVersionDetailResponse>(
        `/api/assets/${asset.id}/versions/${version}`,
      );
      setVersionDetail(detail);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '加载版本详情失败');
    }
  };

  const rollback = async (version: number) => {
    if (!window.confirm(`确定将 v${version} 的内容恢复为一个新草稿版本吗？`)) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await fetchJson<{ asset: AssetDTO }>(
        `/api/assets/${asset.id}/versions/${version}/rollback`,
        { method: 'POST' },
      );
      setVersionDetail(null);
      onUpdated(data.asset);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '回滚版本失败');
    } finally {
      setSaving(false);
    }
  };

  const markReused = async () => {
    const data = await fetchJson<{ reuseCount: number }>(
      `/api/assets/${asset.id}/reuse`,
      { method: 'POST' }
    );
    onUpdated({ ...asset, reuseCount: data.reuseCount });
  };

  return (
    <div className="panel space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-accent/10 px-2 py-1 text-xs text-accent">
              {STATUS_LABELS[asset.status]}
            </span>
            <span className="text-xs text-text-secondary">v{asset.version}</span>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">{asset.title}</h2>
          <p className="mt-1 text-xs text-text-secondary">{asset.project.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {asset.status !== 'ARCHIVED' && (
            <Button size="sm" variant="secondary" onClick={() => void markReused()}>
              标记已复用
            </Button>
          )}
          {asset.canEdit && asset.status === 'DRAFT' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                编辑
              </Button>
              <Button size="sm" onClick={() => void setStatus('REVIEW')} disabled={saving}>
                提交审核
              </Button>
            </>
          )}
          {asset.canReview && asset.status === 'REVIEW' && (
            <>
              <Button size="sm" onClick={() => void setStatus('PUBLISHED')} disabled={saving}>
                发布
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void setStatus('DRAFT')}
                disabled={saving}
              >
                驳回
              </Button>
            </>
          )}
          {asset.canReview && asset.status !== 'ARCHIVED' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void setStatus('ARCHIVED')}
              disabled={saving}
            >
              归档
            </Button>
          )}
          {asset.canReview && asset.status === 'ARCHIVED' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void setStatus('DRAFT')}
              disabled={saving}
            >
              恢复为草稿
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onClose}>关闭</Button>
        </div>
      </div>

      {error && <p className="rounded bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold text-text-secondary">摘要</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{asset.summary}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-text-secondary">解决方案</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{asset.solution}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-text-secondary">根因</h3>
          <p className="mt-2 text-sm text-text-primary">
            {asset.rootCauseCategory?.name ?? '未分类'}
            {asset.rootCauseText ? ` · ${asset.rootCauseText}` : ''}
          </p>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-text-secondary">标签</h3>
          <div className="mt-2 flex flex-wrap gap-1">
            {asset.tags.length ? asset.tags.map((tag) => (
              <span key={tag} className="rounded bg-bg px-2 py-1 text-xs">{tag}</span>
            )) : <span className="text-sm text-text-secondary">—</span>}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-4 border-t border-border pt-4 text-xs text-text-secondary">
        {asset.sourceCase && (
          <Link href={`/case/${asset.sourceCase.id}`} className="text-accent">
            来源用例 {asset.sourceCase.caseNo}
          </Link>
        )}
        <span>浏览 {asset.viewCount}</span>
        <span>复用 {asset.reuseCount}</span>
        <span>更新于 {formatDateTime(asset.updatedAt)}</span>
      </div>

      {asset.canEdit && (
        <section className="border-t border-border pt-5" aria-label="版本历史">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">版本历史</h3>
              <p className="mt-1 text-xs text-text-secondary">
                每次编辑、审核流转和回滚都会生成不可变快照。
              </p>
            </div>
          </div>
          {versionsLoading ? (
            <p className="py-4 text-sm text-text-secondary">加载版本中...</p>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {versions.map((version) => (
                  <button
                    type="button"
                    key={version.id}
                    onClick={() => void showVersion(version.version)}
                    className="w-full rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-bg"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        v{version.version}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {STATUS_LABELS[version.status]}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-text-secondary">
                      {version.author?.username ?? '已删除用户'}
                      {' · '}
                      {formatDateTime(version.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-border p-4">
                {!versionDetail ? (
                  <p className="text-sm text-text-secondary">
                    选择一个版本查看与前一版本的差异摘要。
                  </p>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-text-primary">
                        v{versionDetail.version.version}
                        {versionDetail.compareTo
                          ? ` 对比 v${versionDetail.compareTo.version}`
                          : ' · 基线版本'}
                      </h4>
                      {versionDetail.canRollback
                        && versionDetail.version.version !== asset.version && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={saving}
                            onClick={() =>
                              void rollback(versionDetail.version.version)
                            }
                          >
                            恢复此版本
                          </Button>
                        )}
                    </div>
                    {versionDetail.changes.length === 0 ? (
                      <p className="mt-3 text-sm text-text-secondary">
                        这是基线版本，或与对比版本无差异。
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {versionDetail.changes.map((change) => (
                          <li
                            key={change.field}
                            className="rounded-lg bg-bg px-3 py-2 text-xs text-text-secondary"
                          >
                            <span className="font-medium text-text-primary">
                              {change.label}
                            </span>
                            {' 已变更'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑知识资产"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={() => void save()} loading={saving} loadingLabel="保存中…">
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="标题" value={title} onChange={(event) => setTitle(event.target.value)} />
          <Select
            label="根因分类"
            value={rootCauseCategoryId}
            onChange={(event) => setRootCauseCategoryId(event.target.value)}
            placeholder="未分类"
            options={categories.map((category) => ({
              value: category.id,
              label: `${category.projectId ? '' : '全局 · '}${category.name}`,
            }))}
          />
          <Input
            label="根因补充"
            value={rootCauseText}
            onChange={(event) => setRootCauseText(event.target.value)}
          />
          <Input
            label="标签（逗号分隔）"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
          {[
            ['摘要', summary, setSummary, 6],
            ['解决方案', solution, setSolution, 8],
          ].map(([label, value, setter, rows]) => (
            <Textarea
              key={String(label)}
              label={String(label)}
              value={String(value)}
              rows={Number(rows)}
              onChange={(event) => (setter as (value: string) => void)(event.target.value)}
            />
          ))}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
