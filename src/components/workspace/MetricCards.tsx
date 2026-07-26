'use client';

import { ArrowRight, ClipboardText } from '@phosphor-icons/react';

interface MetricCardsProps {
  metrics: {
    totalCaseCount: number;
    failedCaseCount: number;
    pendingCount: number;
    analyzedCount: number;
    assetCount: number;
  };
  onContinue?: () => void;
}

export default function MetricCards({ metrics, onContinue }: MetricCardsProps) {
  const supportingMetrics = [
    { key: 'total', label: '总用例', value: metrics.totalCaseCount },
    { key: 'failed', label: '失败', value: metrics.failedCaseCount },
    { key: 'analyzed', label: '已分析', value: metrics.analyzedCount },
    { key: 'asset', label: '已沉淀资产', value: metrics.assetCount },
  ];

  return (
    <section className="flex h-full min-h-[334px] flex-col rounded-[18px] border border-border/90 bg-surface-solid p-6 shadow-[0_12px_36px_rgba(38,57,88,0.055)]">
      <div className="flex items-center gap-3">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#ff9348] text-white shadow-[0_10px_24px_rgba(255,122,69,0.20)]">
          <ClipboardText size={26} weight="fill" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-text-secondary">当前需要处理</p>
        </div>
      </div>

      <div className="mt-5">
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-text-primary">
          当前有{' '}
          <span className="font-bold text-[#f57c00]">
            {metrics.pendingCount.toLocaleString()}
          </span>{' '}
          条用例待分析
        </h2>
        <p className="mt-3 text-sm text-text-secondary">
          数量来自当前筛选范围内进展为“待分析”的用例。
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border/70 pt-5">
        {supportingMetrics.map((metric) => (
          <div key={metric.key} data-metric={metric.key}>
            <p className="text-xs text-text-secondary">{metric.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
              {metric.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[9px] bg-accent text-sm font-semibold text-white shadow-[0_8px_20px_rgba(17,96,242,0.18)] transition hover:bg-accent-hover"
        >
          查看待分析用例
          <ArrowRight size={18} weight="bold" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
