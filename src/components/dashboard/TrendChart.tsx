'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface TrendDataPoint {
  batch: string;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passRate: number;
  failRate: number;
  analyzed: number;
  total: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
}

function getBatchDate(batch: string) {
  const match = batch.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:\D|$)/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

function formatBatchLabel(batch: string) {
  const date = getBatchDate(batch);
  if (!date) return batch;

  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

export default function TrendChart({ data }: TrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bento-panel flex min-h-72 items-center justify-center p-8 text-text-secondary">
        暂无数据
      </div>
    );
  }

  const hasDatedBatchNames = data.every((item) => getBatchDate(item.batch));
  const chartData = hasDatedBatchNames
    ? [...data].sort((a, b) => (
        getBatchDate(a.batch)!.getTime() - getBatchDate(b.batch)!.getTime()
      ))
    : data;

  return (
    <section className="bento-panel p-5 sm:p-6" aria-labelledby="quality-trend-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 id="quality-trend-title" className="text-base font-semibold text-text-primary">最近批跑质量趋势</h3>
          <p className="mt-1 text-xs text-text-secondary">悬停数据点查看批跑详情</p>
        </div>
        <span className="text-xs font-medium text-text-secondary">数量 / 比率</span>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            accessibilityLayer
          >
            <XAxis
              dataKey="batch"
              interval="preserveStartEnd"
              minTickGap={22}
              tickFormatter={formatBatchLabel}
              tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              labelFormatter={(label: unknown) => formatBatchLabel(String(label))}
              formatter={(value: unknown, name: unknown) => [
                Number(value).toLocaleString(),
                String(name),
              ]}
              contentStyle={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-md)',
                fontSize: 12,
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Line
              type="monotone"
              dataKey="total"
              name="总用例"
              stroke="#1160f2"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="passed"
              name="通过用例"
              stroke="#169b50"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="failed"
              name="失败用例"
              stroke="#e11d36"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-3 text-xs font-semibold text-text-secondary">通过率 / 失败率</div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              accessibilityLayer
            >
              <XAxis
                dataKey="batch"
                interval="preserveStartEnd"
                minTickGap={22}
                tickFormatter={formatBatchLabel}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(label: unknown) => formatBatchLabel(String(label))}
                formatter={(value: unknown, name: unknown) => [
                  `${Number(value).toFixed(1)}%`,
                  String(name),
                ]}
                contentStyle={{
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: 12,
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
              <Line
                type="monotone"
                dataKey="passRate"
                name="通过率"
                stroke="#169b50"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="failRate"
                name="失败率"
                stroke="#e11d36"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
