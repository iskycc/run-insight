'use client';

import { useState, type FormEvent } from 'react';
import {
  ArrowsClockwise,
  BookmarkSimple,
  FloppyDisk,
  Star,
  Trash,
} from '@phosphor-icons/react';
import { Select } from '@/components/shared/Select';
import type {
  SavedViewDTO,
  SavedViewFilters,
  SavedViewScope,
} from '@/types';

interface CreateSavedViewInput {
  name: string;
  scope: SavedViewScope;
  isDefault: boolean;
}

interface SavedViewsCardProps {
  views: SavedViewDTO[];
  loading: boolean;
  saving: boolean;
  canShare: boolean;
  currentProjectId: string;
  onSelect: (filter: SavedViewFilters) => void;
  onQuickFilter: (filter: Partial<SavedViewFilters>) => void;
  onCreate: (input: CreateSavedViewInput) => Promise<boolean>;
  onUpdate: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const BUILT_IN_FILTERS: {
  label: string;
  description: string;
  filter: Partial<SavedViewFilters>;
}[] = [
  {
    label: '待分析用例',
    description: '进展为待分析',
    filter: { progressCategory: 'PENDING' },
  },
  {
    label: '失败用例',
    description: '结果概要为 FAIL',
    filter: { resultSummary: 'FAIL' },
  },
  {
    label: '已修复用例',
    description: '进展为已修复',
    filter: { progressCategory: 'FIXED' },
  },
  {
    label: '已保存资产',
    description: '资产状态为已保存',
    filter: { assetSaved: 'true' },
  },
];

export default function SavedViewsCard({
  views,
  loading,
  saving,
  canShare,
  currentProjectId,
  onSelect,
  onQuickFilter,
  onCreate,
  onUpdate,
  onSetDefault,
  onDelete,
}: SavedViewsCardProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<SavedViewScope>('PERSONAL');
  const [isDefault, setIsDefault] = useState(false);
  const effectiveScope =
    scope === 'PROJECT' && (!currentProjectId || !canShare) ? 'PERSONAL' : scope;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await onCreate({ name, scope: effectiveScope, isDefault });
    if (created) {
      setName('');
      setScope('PERSONAL');
      setIsDefault(false);
      setFormOpen(false);
    }
  };

  return (
    <section className="flex h-full min-h-[334px] flex-col rounded-[18px] border border-border/90 bg-surface-solid p-6 shadow-[0_12px_36px_rgba(38,57,88,0.055)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-text-primary">
            保存视图
          </h2>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            保存当前筛选，稍后可一键恢复。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          className="shrink-0 rounded-[9px] bg-accent/8 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/12"
        >
          {formOpen ? '取消' : '保存当前'}
        </button>
      </div>

      {formOpen && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-[12px] bg-bg/70 p-3">
          <label className="block">
            <span className="sr-only">视图名称</span>
            <input
              aria-label="视图名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              placeholder="输入视图名称"
              className="field-control h-10 w-full rounded-[9px] px-3 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="保存范围"
              aria-label="保存范围"
              value={effectiveScope}
              onChange={(event) => setScope(event.target.value as SavedViewScope)}
              className="h-9 rounded-[9px] px-2 text-xs"
              options={[
                { value: 'PERSONAL', label: '仅自己' },
                ...(canShare && currentProjectId
                  ? [{ value: 'PROJECT', label: '项目共享' }]
                  : []),
              ]}
            />
            <label className="flex items-end gap-2 pb-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
                className="h-4 w-4 rounded border-border text-accent"
              />
              设为默认
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[9px] bg-accent text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FloppyDisk size={15} weight="bold" aria-hidden="true" />
            {saving ? '保存中…' : '确认保存'}
          </button>
        </form>
      )}

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          已保存
        </p>
        {loading ? (
          <p className="py-3 text-xs text-text-secondary">正在加载保存视图…</p>
        ) : views.length === 0 ? (
          <p className="rounded-[10px] bg-bg/60 px-3 py-3 text-xs leading-5 text-text-secondary">
            暂无保存视图。保存后会在这里显示。
          </p>
        ) : (
          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {views.map((view) => (
              <div
                key={view.id}
                className="group flex min-h-11 items-center gap-1 rounded-[10px] px-1 transition hover:bg-bg/70"
              >
                <button
                  type="button"
                  onClick={() => onSelect(view.filters)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-2 text-left"
                  aria-label={`加载视图 ${view.name}`}
                >
                  <BookmarkSimple size={16} className="shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-text-primary">
                        {view.name}
                      </span>
                      {view.isDefault && (
                        <span className="rounded-full bg-accent/8 px-1.5 text-[9px] font-semibold text-accent">
                          默认
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-text-secondary">
                      {view.scope === 'PROJECT' ? `项目共享 · ${view.ownerName}` : '个人视图'}
                    </span>
                  </span>
                </button>
                {view.canManage && (
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => onUpdate(view.id)}
                      aria-label={`用当前筛选更新视图 ${view.name}`}
                      title="用当前筛选更新"
                      className="rounded-md p-1.5 text-text-secondary hover:bg-white hover:text-accent"
                    >
                      <ArrowsClockwise size={14} aria-hidden="true" />
                    </button>
                    {!view.isDefault && (
                      <button
                        type="button"
                        onClick={() => onSetDefault(view.id)}
                        aria-label={`设为默认视图 ${view.name}`}
                        title="设为默认"
                        className="rounded-md p-1.5 text-text-secondary hover:bg-white hover:text-accent"
                      >
                        <Star size={14} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(view.id)}
                      aria-label={`删除视图 ${view.name}`}
                      title="删除"
                      className="rounded-md p-1.5 text-text-secondary hover:bg-danger/8 hover:text-danger"
                    >
                      <Trash size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-border/60 pt-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          内置快捷筛选
        </p>
        <div className="grid grid-cols-2 gap-1">
          {BUILT_IN_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              title={filter.description}
              onClick={() => onQuickFilter(filter.filter)}
              className="min-h-8 rounded-[8px] px-2 text-left text-[11px] font-medium text-text-secondary transition hover:bg-bg/70 hover:text-text-primary"
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
