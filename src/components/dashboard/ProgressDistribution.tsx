'use client';

import { PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  '待分析': '#86868b',
  '分析中': '#ff9500',
  '已定位': '#ff3b30',
  '已修复': '#34c759',
  '非问题': '#32ade6',
  '阻塞': '#af52de',
};

const CATEGORY_ORDER = ['待分析', '分析中', '已定位', '已修复', '非问题', '阻塞'];

interface ProgressItem {
  category: string;
  count: number;
}

interface ProgressDistributionProps {
  data: ProgressItem[];
}

export default function ProgressDistribution({ data }: ProgressDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bento-panel flex min-h-72 items-center justify-center p-8 text-text-secondary">
        暂无数据
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const sortedData = CATEGORY_ORDER
    .map((cat) => {
      const found = data.find((d) => d.category === cat);
      return found ? { ...found, fill: CATEGORY_COLORS[cat] || '#8e8e93' } : { category: cat, count: 0, fill: CATEGORY_COLORS[cat] || '#8e8e93' };
    })
    .filter((d) => d.count > 0);

  return (
    <section className="bento-panel self-start p-5 sm:p-6" aria-labelledby="progress-distribution-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 id="progress-distribution-title" className="text-base font-semibold text-text-primary">进展分布</h3>
          <p className="mt-1 text-xs text-text-secondary">按分析阶段查看用例状态</p>
        </div>
        <span className="text-xs font-medium text-text-secondary">共 {total} 条</span>
      </div>
      <div className="grid items-center gap-5 sm:grid-cols-[minmax(150px,0.72fr)_minmax(0,1.28fr)]">
        <div className="relative mx-auto h-48 w-full max-w-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sortedData}
                dataKey="count"
                nameKey="category"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={1.5}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Tooltip
                formatter={(value: unknown) => {
                  const num = Number(value);
                  const pct = total > 0 ? ((num / total) * 100).toFixed(1) : '0';
                  return `${num} (${pct}%)`;
                }}
                contentStyle={{
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-text-secondary">总计</span>
            <strong className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
              {total}
            </strong>
          </div>
        </div>

        <div className="space-y-3">
          {sortedData.map((item) => {
            const percentage = total > 0 ? (item.count / total) * 100 : 0;
            return (
              <div key={item.category} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  {item.category}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-bg">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      backgroundColor: item.fill,
                      width: `${percentage}%`,
                    }}
                  />
                </span>
                <span className="min-w-16 text-right font-medium tabular-nums text-text-primary">
                  {item.count}
                  <span className="ml-1 font-normal text-text-secondary">
                    ({percentage.toFixed(1)}%)
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <ul className="sr-only">
        {sortedData.map((item) => (
          <li key={item.category}>
            {item.category}：{item.count} 条，占
            {total > 0 ? ((item.count / total) * 100).toFixed(1) : '0'}%
          </li>
        ))}
      </ul>
    </section>
  );
}
