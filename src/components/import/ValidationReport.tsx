'use client';

import type { ValidationError } from '@/lib/validations';

interface ValidationReportProps {
  errors: ValidationError[];
  totalRows: number;
}

export default function ValidationReport({ errors, totalRows }: ValidationReportProps) {
  if (errors.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-success)] bg-[var(--color-success)]/5 p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2">
          <span className="text-lg text-[var(--color-success)]">✓</span>
          <span className="text-sm font-medium text-[var(--color-success)]">
            校验通过
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          共 {totalRows} 条数据，未发现错误
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-danger)] bg-[var(--color-danger)]/5 p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2">
        <span className="text-lg text-[var(--color-danger)]">✕</span>
        <span className="text-sm font-medium text-[var(--color-danger)]">
          校验失败 — 发现 {errors.length} 个错误
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        共 {totalRows} 条数据，{errors.length} 条校验未通过
      </p>
      <div className="mt-4 max-h-60 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-secondary)]">
              <th className="px-2 py-1 font-medium">行号</th>
              <th className="px-2 py-1 font-medium">字段</th>
              <th className="px-2 py-1 font-medium">错误信息</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((err, i) => (
              <tr key={i} className="border-t border-[var(--color-border)]">
                <td className="px-2 py-1 text-[var(--color-text-primary)]">{err.row}</td>
                <td className="px-2 py-1 font-mono text-xs text-[var(--color-accent)]">{err.field}</td>
                <td className="px-2 py-1 text-[var(--color-danger)]">{err.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
