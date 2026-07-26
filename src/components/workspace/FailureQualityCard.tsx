'use client';

import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  待分析: '#86868b',
  分析中: '#f28c00',
  已定位: '#ee2737',
  已修复: '#16a653',
  非问题: '#0796b8',
  阻塞: '#6e35e8',
};

const CATEGORY_ORDER = ['已定位', '分析中', '已修复', '非问题', '阻塞', '待分析'];

interface FailureQualityCardProps {
  failureCount: number;
  totalCaseCount: number;
  data: { category: string; count: number }[];
}

export default function FailureQualityCard({
  failureCount,
  totalCaseCount,
  data,
}: FailureQualityCardProps) {
  const distributionTotal = data.reduce((sum, item) => sum + item.count, 0);
  const failureRate =
    totalCaseCount > 0 ? (failureCount / totalCaseCount) * 100 : 0;
  const chartData = CATEGORY_ORDER.map((category) => {
    const item = data.find((entry) => entry.category === category);
    return {
      category,
      count: item?.count ?? 0,
      fill: CATEGORY_COLORS[category],
    };
  }).filter((item) => item.count > 0);

  return (
    <section className="h-full min-h-[334px] rounded-[18px] border border-border/90 bg-surface-solid p-6 shadow-[0_12px_36px_rgba(38,57,88,0.055)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-text-primary">
            质量概览
          </h2>
          <p className="mt-3 text-xs font-medium text-text-secondary">失败用例</p>
          <p className="mt-1 text-[34px] font-bold leading-none tracking-[-0.04em] text-text-primary">
            {failureCount.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            失败率 <span className="font-semibold text-text-primary">{failureRate.toFixed(1)}%</span>
          </p>
        </div>
        <span className="rounded-full bg-bg px-2.5 py-1 text-[11px] font-medium text-text-secondary">
          暂无历史对比数据
        </span>
      </div>

      <div className="mt-1 grid items-center gap-5 sm:grid-cols-[155px_minmax(0,1fr)]">
        <div className="relative mx-auto h-[155px] w-[155px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="category"
                innerRadius={52}
                outerRadius={72}
                paddingAngle={1}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Tooltip
                formatter={(value: unknown) => `${Number(value)} 条`}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid rgba(29,29,31,.1)',
                  boxShadow: '0 12px 30px rgba(0,0,0,.08)',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-text-secondary">已分类</span>
            <strong className="mt-1 text-lg font-semibold text-text-primary">
              {distributionTotal.toLocaleString()}
            </strong>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-medium text-text-secondary">进展分布</span>
            <span className="text-text-secondary">共 {distributionTotal} 条</span>
          </div>
          <div className="space-y-3">
            {chartData.map((item) => {
              const percentage =
                distributionTotal > 0 ? (item.count / distributionTotal) * 100 : 0;
              return (
                <div
                  key={item.category}
                  className="grid grid-cols-[62px_minmax(0,1fr)_72px] items-center gap-2 text-xs"
                >
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: item.fill }}
                    />
                    {item.category}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-[#f0f1f4]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        backgroundColor: item.fill,
                        width: `${percentage}%`,
                      }}
                    />
                  </span>
                  <span className="text-right tabular-nums text-text-secondary">
                    {item.count}{' '}
                    <span className="text-[11px]">
                      ({percentage.toFixed(1)}%)
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
