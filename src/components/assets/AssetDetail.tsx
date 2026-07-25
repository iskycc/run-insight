'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { Select } from '@/components/shared/Select';
import { ApiError, fetchJson } from '@/lib/fetch';
import type {
  AssetDTO,
  AssetStatus,
  RootCauseCategoriesResponse,
  RootCauseCategoryDTO,
} from '@/types';

const STATUS_LABELS: Record<AssetStatus, string> = {
  DRAFT: '草稿',
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

  useEffect(() => {
    void fetchJson<RootCauseCategoriesResponse>(
      `/api/root-cause-categories?projectId=${encodeURIComponent(asset.projectId)}`
    ).then((data) => setCategories(data.categories)).catch(() => undefined);
  }, [asset.projectId]);

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
    try {
      await update({ status });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '更新资产状态失败');
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
    <div className="panel space-y-lg p-lg">
      <div className="flex flex-wrap items-start justify-between gap-sm">
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
          <Button size="sm" variant="secondary" onClick={() => void markReused()}>
            标记已复用
          </Button>
          {asset.canEdit && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                编辑
              </Button>
              {asset.status !== 'PUBLISHED' && (
                <Button size="sm" onClick={() => void setStatus('PUBLISHED')}>发布</Button>
              )}
              {asset.status !== 'ARCHIVED' && (
                <Button size="sm" variant="secondary" onClick={() => void setStatus('ARCHIVED')}>
                  归档
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="secondary" onClick={onClose}>关闭</Button>
        </div>
      </div>

      {error && <p className="rounded bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <section className="grid gap-md sm:grid-cols-2">
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

      <div className="flex flex-wrap gap-md border-t border-border pt-md text-xs text-text-secondary">
        {asset.sourceCase && (
          <Link href={`/case/${asset.sourceCase.id}`} className="text-accent">
            来源用例 {asset.sourceCase.caseNo}
          </Link>
        )}
        <span>浏览 {asset.viewCount}</span>
        <span>复用 {asset.reuseCount}</span>
        <span>更新于 {new Date(asset.updatedAt).toLocaleString('zh-CN')}</span>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑知识资产"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <div className="space-y-md">
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
            <label key={String(label)} className="block text-sm font-medium">
              {String(label)}
              <textarea
                value={String(value)}
                rows={Number(rows)}
                onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                className="field-control mt-1 w-full resize-y px-3 py-2 text-sm"
              />
            </label>
          ))}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
