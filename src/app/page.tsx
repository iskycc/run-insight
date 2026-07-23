'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/dashboard/StatCard';
import ProgressDistribution from '@/components/dashboard/ProgressDistribution';
import TrendChart from '@/components/dashboard/TrendChart';
import { useAuth } from '@/components/shared/AuthProvider';
import type { DashboardStatsResponse, TrendResponse } from '@/types';

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
      <div className="flex items-center justify-center p-xl">
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-xl">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard title="项目数" value={stats?.projectCount ?? 0} />
        <StatCard title="测试阶段数" value={stats?.testStageCount ?? 0} />
        <StatCard title="批跑数" value={stats?.batchScopeCount ?? 0} />
        <StatCard title="用例总数" value={stats?.totalCaseCount ?? 0} />
        <StatCard title="失败数" value={stats?.failedCaseCount ?? 0} />
        <StatCard title="已分析数" value={stats?.analyzedCaseCount ?? 0} />
        <StatCard title="资产数" value={stats?.assetCount ?? 0} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProgressDistribution data={stats?.progressDistribution ?? []} />
        <TrendChart data={trend?.trends ?? []} />
      </div>

      {/* Login prompt */}
      {!authLoading && !user && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] p-6 text-center shadow-[var(--shadow-sm)]">
          <p className="text-sm text-[var(--color-text-secondary)]">
            登录后可查看详细数据、分析用例和保存资产
          </p>
        </div>
      )}
    </div>
  );
}
