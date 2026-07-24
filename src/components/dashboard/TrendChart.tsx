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

export default function TrendChart({ data }: TrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="panel flex min-h-72 items-center justify-center p-8 text-text-secondary">
        暂无数据
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">最近批跑质量趋势</h3>
        <span className="text-xs font-medium text-text-secondary">数量 / 比率</span>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <XAxis
              dataKey="batch"
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
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="passed"
              name="通过用例"
              stroke="var(--color-success)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="failed"
              name="失败用例"
              stroke="var(--color-danger)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-3 text-xs font-semibold text-text-secondary">通过率 / 失败率</div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <XAxis
                dataKey="batch"
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
                stroke="var(--color-success)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="failRate"
                name="失败率"
                stroke="var(--color-danger)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
