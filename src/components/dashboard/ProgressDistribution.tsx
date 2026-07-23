'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  '待分析': 'var(--color-progress-pending)',
  '分析中': 'var(--color-progress-analyzing)',
  '已定位': 'var(--color-progress-located)',
  '已修复': 'var(--color-progress-fixed)',
  '非问题': 'var(--color-progress-not-issue)',
  '阻塞': 'var(--color-progress-blocked)',
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
      <div className="flex items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] p-8 shadow-[var(--shadow-sm)] text-[var(--color-text-secondary)]">
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
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-sm)]">
      <h3 className="mb-4 text-sm font-medium text-[var(--color-text-primary)]">进展分类分布</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sortedData} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="category" tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value: unknown) => {
                const num = Number(value);
                const pct = total > 0 ? ((num / total) * 100).toFixed(1) : '0';
                return `${num} (${pct}%)`;
              }}
              contentStyle={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 12 }}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
              {sortedData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {sortedData.map((d) => (
          <div key={d.category} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: d.fill }}
            />
            <span className="text-[var(--color-text-secondary)]">{d.category}</span>
            <span className="font-medium text-[var(--color-text-primary)]">{d.count}</span>
            <span className="text-[var(--color-text-secondary)]">
              ({total > 0 ? ((d.count / total) * 100).toFixed(1) : '0'}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
