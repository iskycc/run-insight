'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ResultCompositionProps = {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
};

const RESULT_META = {
  passed: { label: '通过', color: '#169b50' },
  failed: { label: '失败', color: '#e11d36' },
  blocked: { label: '阻塞', color: '#d97706' },
  skipped: { label: '跳过', color: '#86868b' },
} as const;

export default function ResultComposition({
  passed,
  failed,
  blocked,
  skipped,
}: ResultCompositionProps) {
  const data = [
    { key: 'passed', label: RESULT_META.passed.label, count: passed, fill: RESULT_META.passed.color },
    { key: 'failed', label: RESULT_META.failed.label, count: failed, fill: RESULT_META.failed.color },
    { key: 'blocked', label: RESULT_META.blocked.label, count: blocked, fill: RESULT_META.blocked.color },
    { key: 'skipped', label: RESULT_META.skipped.label, count: skipped, fill: RESULT_META.skipped.color },
  ];
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="bento-panel p-5 sm:p-6" aria-labelledby="result-composition-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 id="result-composition-title" className="text-base font-semibold text-text-primary">
            执行结果构成
          </h3>
          <p className="mt-1 text-xs text-text-secondary">对比各类执行结果的用例数量</p>
        </div>
        <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-medium text-text-secondary">
          共 {total.toLocaleString()} 条
        </span>
      </div>

      {total === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-secondary">
          暂无数据
        </div>
      ) : (
        <>
          <div
            className="h-48"
            role="img"
            aria-label="通过、失败、阻塞和跳过用例数量横向条形图"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 2, right: 18, bottom: 2, left: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 4" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={40}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(17, 96, 242, 0.04)' }}
                  formatter={(value: unknown) => [`${Number(value).toLocaleString()} 条`, '用例']}
                  contentStyle={{
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-md)',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-4">
            {data.map((item) => (
              <div key={item.key} className="min-w-0 text-center">
                <span
                  className="mx-auto mb-1.5 block h-1.5 w-6 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <strong className="block truncate text-sm font-semibold tabular-nums text-text-primary">
                  {item.count.toLocaleString()}
                </strong>
                <span className="text-[11px] text-text-secondary">{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
