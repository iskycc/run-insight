'use client';

import StatCard from '@/components/dashboard/StatCard';

interface MetricCardsProps {
  metrics: {
    totalCaseCount: number;
    failedCaseCount: number;
    pendingCount: number;
    analyzedCount: number;
    assetCount: number;
  };
}

export default function MetricCards({ metrics }: MetricCardsProps) {
  const cards = [
    { key: 'total', title: '用例总数', value: metrics.totalCaseCount },
    { key: 'failed', title: '失败数', value: metrics.failedCaseCount },
    { key: 'pending', title: '待分析', value: metrics.pendingCount },
    { key: 'analyzed', title: '已分析', value: metrics.analyzedCount },
    { key: 'asset', title: '资产数', value: metrics.assetCount },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.key} data-metric={card.key}>
          <StatCard title={card.title} value={card.value} />
        </div>
      ))}
    </div>
  );
}
