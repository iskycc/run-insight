'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { Textarea } from '@/components/shared/Textarea';
import { LoadingState } from '@/components/shared/LoadingState';
import { ApiError, fetchJson } from '@/lib/fetch';
import type {
  RootCauseCategoriesResponse,
  RootCauseCategoryDTO,
} from '@/types';

type Props = {
  projectId?: string;
};

export function RootCauseManager({ projectId }: Props) {
  const [categories, setCategories] = useState<RootCauseCategoryDTO[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<RootCauseCategoryDTO | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ includeArchived: 'true' });
      if (projectId) query.set('projectId', projectId);
      const data = await fetchJson<RootCauseCategoriesResponse>(
        `/api/root-cause-categories?${query}`
      );
      setCategories(
        projectId
          ? data.categories.filter((category) => category.projectId === projectId)
          : data.categories
      );
      setCanManage(data.canManage);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '加载根因分类失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setError('');
    setModalOpen(true);
  };

  const openEdit = (category: RootCauseCategoryDTO) => {
    setEditing(category);
    setName(category.name);
    setDescription(category.description ?? '');
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setError('分类名称不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await fetchJson(
        editing
          ? `/api/root-cause-categories/${editing.id}`
          : '/api/root-cause-categories',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(!editing ? { projectId: projectId ?? null } : {}),
            name: name.trim(),
            description: description.trim() || null,
          }),
        }
      );
      setModalOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '保存根因分类失败');
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (category: RootCauseCategoryDTO) => {
    await fetchJson(`/api/root-cause-categories/${category.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !category.archived }),
    });
    await load();
  };

  const remove = async (category: RootCauseCategoryDTO) => {
    if (!window.confirm(`确定删除“${category.name}”吗？关联用例和资产将变为未分类。`)) {
      return;
    }
    await fetchJson(`/api/root-cause-categories/${category.id}`, {
      method: 'DELETE',
    });
    await load();
  };

  if (loading) {
    return <LoadingState label="正在加载根因分类" rows={4} />;
  }

  return (
    <div className="space-y-4">
      <div className="bento-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-semibold text-text-primary">
            {projectId ? '项目根因分类' : '全局根因分类'}
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            {projectId
              ? '仅用于当前项目；全局分类仍可供所有项目复用。'
              : '作为所有项目的通用分类模板，项目仍可维护自己的专属分类。'}
          </p>
        </div>
        {canManage && <Button onClick={openCreate}>新建分类</Button>}
      </div>

      {error && !modalOpen && (
        <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
      )}

      {categories.length === 0 ? (
        <EmptyState
          title="暂无根因分类"
          description={
            canManage
              ? '建议从环境、数据、代码缺陷或非问题等常见原因开始创建。'
              : '管理员尚未配置分类，分析时仍可填写具体原因。'
          }
          actionLabel={canManage ? '创建第一个分类' : undefined}
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <div className="bento-panel divide-y divide-border overflow-hidden">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{category.name}</span>
                  {category.archived && (
                    <span className="rounded bg-bg px-2 py-0.5 text-xs text-text-secondary">
                      已归档
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {category.description || '暂无说明'}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  已关联 {category.usageCount ?? 0} 个用例或资产
                </p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(category)}>
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void setArchived(category)}
                  >
                    {category.archived ? '取消归档' : '归档'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(category)}>
                    删除
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑根因分类' : '新建根因分类'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void save()} loading={saving} loadingLabel="保存中…">
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="分类名称"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <Textarea
            id="root-cause-description"
            label="分类说明"
            value={description}
            maxLength={1000}
            rows={4}
            onChange={(event) => setDescription(event.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
