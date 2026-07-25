'use client';

import { EmptyState } from '@/components/shared/EmptyState';
import type { AssetDTO } from '@/types';

export type AssetItem = AssetDTO;

const STATUS_LABELS = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
} as const;

type Props = {
  assets: AssetItem[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSelect: (id: string) => void;
};

export function AssetList({
  assets,
  total,
  page,
  pageSize,
  onPageChange,
  onSelect,
}: Props) {
  const totalPages = Math.ceil(total / pageSize);
  if (!assets.length) {
    return (
      <EmptyState
        title="暂无知识资产"
        description="将分析完成的用例保存为资产后，即可在这里持续维护和复用。"
      />
    );
  }

  return (
    <div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-border bg-bg/70 text-left text-xs text-text-secondary">
              <th className="px-md py-sm font-medium">资产</th>
              <th className="px-md py-sm font-medium">项目</th>
              <th className="px-md py-sm font-medium">根因分类</th>
              <th className="px-md py-sm font-medium">标签</th>
              <th className="px-md py-sm font-medium">状态</th>
              <th className="px-md py-sm font-medium">版本 / 使用</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr
                key={asset.id}
                onClick={() => onSelect(asset.id)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-bg/70"
              >
                <td className="max-w-[320px] px-md py-sm">
                  <p className="truncate text-sm font-medium text-text-primary">{asset.title}</p>
                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {asset.sourceCase?.caseNo ?? '独立资产'} · {asset.summary}
                  </p>
                </td>
                <td className="px-md py-sm text-sm text-text-secondary">{asset.project.name}</td>
                <td className="px-md py-sm text-sm text-text-secondary">
                  {asset.rootCauseCategory?.name ?? '未分类'}
                </td>
                <td className="px-md py-sm">
                  <div className="flex max-w-[220px] flex-wrap gap-1">
                    {asset.tags.length
                      ? asset.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded bg-bg px-2 py-0.5 text-xs text-text-secondary">
                            {tag}
                          </span>
                        ))
                      : <span className="text-xs text-text-secondary">—</span>}
                  </div>
                </td>
                <td className="px-md py-sm">
                  <span className="rounded-md bg-accent/10 px-2 py-1 text-xs text-accent">
                    {STATUS_LABELS[asset.status]}
                  </span>
                </td>
                <td className="px-md py-sm text-xs text-text-secondary">
                  v{asset.version} · 浏览 {asset.viewCount} · 复用 {asset.reuseCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-lg flex items-center justify-center gap-sm">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm text-text-secondary">{page} / {totalPages}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
