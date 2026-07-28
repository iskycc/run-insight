'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/dashboard/StatCard';
import ProgressDistribution from '@/components/dashboard/ProgressDistribution';
import TrendChart from '@/components/dashboard/TrendChart';
import ResultComposition from '@/components/dashboard/ResultComposition';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/components/shared/AuthProvider';
import Link from 'next/link';
import { ArrowRight, ChartLineUp, ShieldCheck, Stack } from '@phosphor-icons/react';
import type { DashboardStatsResponse, TrendResponse } from '@/types';

function formatRate(value?: number) {
  return `${(value ?? 0).toFixed(1)}%`;
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, trendRes] = await Promise.all([
          fetch('/api/stats/dashboard'),
          fetch('/api/stats/trend?limit=10'),
        ]);

        if (statsRes.ok) {
          const data: DashboardStatsResponse = await statsRes.json();
          setStats(data);
        }

        if (trendRes.ok) {
          const data: TrendResponse = await trendRes.json();
          setTrend(data);
        }

        if (!statsRes.ok && !trendRes.ok) {
          setError('加载数据失败');
        }
      } catch {
        setError('网络错误');
      }
    }
    fetchData();
  }, []);

  if (error) {
    return (
      <PageContainer title="质量大盘" subtitle="跨项目追踪批跑结果、分析进度与资产沉淀">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-danger">{error}</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="质量大盘"
      subtitle="从测试结果到分析资产，快速掌握当前质量健康度"
      actions={
        user ? (
          <Link
            href="/workspace"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-white shadow-[0_4px_14px_rgba(17,96,242,0.16)]"
          >
            打开工作台
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="bento-panel p-6 sm:p-7" aria-labelledby="quality-health-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-secondary">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <ShieldCheck size={21} weight="duotone" aria-hidden="true" />
                  </span>
                  <span id="quality-health-title">质量健康度</span>
                </div>
                <p className="text-[42px] font-semibold leading-none tracking-[-0.045em] text-text-primary sm:text-[52px]">
                  {formatRate(stats?.passRate)}
                </p>
                <p className="mt-2 text-sm text-text-secondary">当前用例通过率</p>
              </div>
              <div className="flex min-w-44 items-center gap-2 rounded-full bg-bg px-3 py-2 text-xs font-medium text-text-secondary">
                <ChartLineUp size={16} className="text-accent" aria-hidden="true" />
                共 {(stats?.totalCaseCount ?? 0).toLocaleString()} 条用例
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 divide-x divide-border border-t border-border pt-5 sm:grid-cols-4">
              <StatCard title="通过" value={stats?.passedCaseCount ?? 0} />
              <StatCard title="失败" value={stats?.failedCaseCount ?? 0} tone="danger" />
              <StatCard title="阻塞" value={stats?.blockedCaseCount ?? 0} tone="warning" />
              <StatCard title="跳过" value={stats?.skippedCaseCount ?? 0} />
            </div>
          </section>

          <section className="bento-panel p-6 sm:p-7" aria-labelledby="analysis-loop-title">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success">
                <Stack size={21} weight="duotone" aria-hidden="true" />
              </span>
              <span id="analysis-loop-title">分析闭环</span>
            </div>
            <div className="mt-7 grid grid-cols-3 divide-x divide-border">
              <StatCard title="已分析" value={stats?.analyzedCaseCount ?? 0} />
              <StatCard title="分析资产" value={stats?.assetCount ?? 0} />
              <StatCard title="批跑范围" value={stats?.batchScopeCount ?? 0} />
            </div>
            <div className="mt-7 rounded-[14px] bg-bg px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-secondary">失败率</span>
                <span className="font-semibold text-danger">{formatRate(stats?.failRate)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-danger"
                  style={{ width: `${Math.min(100, stats?.failRate ?? 0)}%` }}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)]">
          <div className="grid h-full gap-5">
            <ProgressDistribution data={stats?.progressDistribution ?? []} />
            <ResultComposition
              passed={stats?.passedCaseCount ?? 0}
              failed={stats?.failedCaseCount ?? 0}
              blocked={stats?.blockedCaseCount ?? 0}
              skipped={stats?.skippedCaseCount ?? 0}
            />
          </div>
          <TrendChart data={trend?.trends ?? []} />
        </div>

        {!authLoading && !user && (
          <div className="panel flex items-center justify-center p-5 text-center">
            <p className="text-sm text-text-secondary">
              登录后可查看详细数据、分析用例和保存资产
            </p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
