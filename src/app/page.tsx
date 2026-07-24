'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/dashboard/StatCard';
import ProgressDistribution from '@/components/dashboard/ProgressDistribution';
import TrendChart from '@/components/dashboard/TrendChart';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/components/shared/AuthProvider';
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
    <PageContainer title="质量大盘" subtitle="跨项目追踪批跑结果、分析进度与资产沉淀">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard title="通过率" value={formatRate(stats?.passRate)} />
          <StatCard title="失败率" value={formatRate(stats?.failRate)} />
          <StatCard title="通过用例" value={stats?.passedCaseCount ?? 0} />
          <StatCard title="失败用例" value={stats?.failedCaseCount ?? 0} />
          <StatCard title="用例总数" value={stats?.totalCaseCount ?? 0} />
          <StatCard title="阻塞用例" value={stats?.blockedCaseCount ?? 0} />
          <StatCard title="跳过用例" value={stats?.skippedCaseCount ?? 0} />
          <StatCard title="已分析数" value={stats?.analyzedCaseCount ?? 0} />
          <StatCard title="资产数" value={stats?.assetCount ?? 0} />
          <StatCard title="批跑数" value={stats?.batchScopeCount ?? 0} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
          <ProgressDistribution data={stats?.progressDistribution ?? []} />
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
