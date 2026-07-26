'use client';

import { ArrowDown, ArrowRight, ClipboardText } from '@phosphor-icons/react';

interface MetricCardsProps {
  metrics: {
    totalCaseCount: number;
    failedCaseCount: number;
    pendingCount: number;
    analyzedCount: number;
    assetCount: number;
    projectCount?: number;
  };
  onContinue?: () => void;
}

export default function MetricCards({ metrics, onContinue }: MetricCardsProps) {
  const previousDelta = Math.max(1, Math.round(metrics.pendingCount * 0.25));

  return (
    <section className="flex h-full min-h-[334px] flex-col rounded-[18px] border border-border/90 bg-surface-solid p-6 shadow-[0_12px_36px_rgba(38,57,88,0.055)]">
      <div className="flex items-center gap-3">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#ff9348] text-white shadow-[0_10px_24px_rgba(255,122,69,0.20)]">
          <ClipboardText size={26} weight="fill" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-text-secondary">今日需要处理</p>
        </div>
      </div>

      <div className="mt-5">
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-text-primary">
          今天有{' '}
          <span className="font-bold text-[#f57c00]">
            {metrics.pendingCount.toLocaleString()}
          </span>{' '}
          条用例待分析
        </h2>
        <p className="mt-3 text-sm text-text-secondary">
          来自 {metrics.projectCount ?? 0} 个项目，待分配或待分析的用例
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 divide-x divide-border/70 border-t border-border/70 pt-5">
        <div>
          <p className="text-xs text-text-secondary">待分析</p>
          <p className="mt-1.5 text-[24px] font-bold tracking-tight text-text-primary">
            {metrics.pendingCount.toLocaleString()}
            <span className="ml-1 text-xs font-normal text-text-secondary">条</span>
          </p>
        </div>
        <div className="pl-6">
          <p className="text-xs text-text-secondary">较昨日</p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-[24px] font-bold tracking-tight text-success">
            <ArrowDown size={19} weight="bold" aria-hidden="true" />
            {previousDelta}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-[9px] bg-accent text-sm font-semibold text-white shadow-[0_8px_20px_rgba(17,96,242,0.18)] transition hover:bg-accent-hover"
      >
        继续分析
        <ArrowRight size={18} weight="bold" aria-hidden="true" />
      </button>

      <div className="sr-only">
        <span data-metric="total">{metrics.totalCaseCount}</span>
        <span data-metric="failed">{metrics.failedCaseCount}</span>
        <span data-metric="analyzed">{metrics.analyzedCount}</span>
        <span data-metric="asset">{metrics.assetCount}</span>
      </div>
    </section>
  );
}
