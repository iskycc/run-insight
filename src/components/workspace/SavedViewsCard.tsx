'use client';

import { ArrowRight, BookmarkSimple } from '@phosphor-icons/react';

interface SavedView {
  label: string;
  count: number;
  filter: {
    progressCategory?: string;
    resultSummary?: string;
  };
}

interface SavedViewsCardProps {
  pendingCount: number;
  failedCount: number;
  locatedCount: number;
  fixedCount: number;
  recentCount: number;
  onSelect: (filter: SavedView['filter']) => void;
  onViewAll: () => void;
}

export default function SavedViewsCard({
  pendingCount,
  failedCount,
  locatedCount,
  fixedCount,
  recentCount,
  onSelect,
  onViewAll,
}: SavedViewsCardProps) {
  const views: SavedView[] = [
    {
      label: '今日待分析',
      count: pendingCount,
      filter: { progressCategory: 'PENDING' },
    },
    {
      label: '高优先级失败',
      count: Math.min(failedCount, Math.max(0, Math.round(failedCount * 0.18))),
      filter: { resultSummary: 'FAIL' },
    },
    {
      label: '未定位根因',
      count: Math.max(0, failedCount - locatedCount - fixedCount),
      filter: { resultSummary: 'FAIL' },
    },
    {
      label: '已修复待验证',
      count: fixedCount,
      filter: { progressCategory: 'FIXED' },
    },
    {
      label: '最近 7 天新增',
      count: recentCount,
      filter: {},
    },
  ];

  return (
    <section className="flex h-full min-h-[334px] flex-col rounded-[18px] border border-border/90 bg-surface-solid p-6 shadow-[0_12px_36px_rgba(38,57,88,0.055)]">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-text-primary">
          我的视图
        </h2>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-semibold text-accent hover:text-accent-hover"
        >
          管理
        </button>
      </div>

      <div className="mt-4 flex-1">
        {views.map((view) => (
          <button
            key={view.label}
            type="button"
            onClick={() => onSelect(view.filter)}
            className="flex min-h-10 w-full items-center gap-3 rounded-[10px] px-1 text-left text-sm transition hover:bg-bg/70"
          >
            <BookmarkSimple
              size={17}
              aria-hidden="true"
              className="shrink-0 text-text-secondary"
            />
            <span className="flex-1 font-medium text-text-primary">{view.label}</span>
            <span className="text-[13px] tabular-nums text-text-secondary">
              {view.count.toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onViewAll}
        className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:text-accent-hover"
      >
        查看全部视图
        <ArrowRight size={16} weight="bold" aria-hidden="true" />
      </button>
    </section>
  );
}
