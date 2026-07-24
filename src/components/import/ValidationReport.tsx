'use client';

import type { ValidationError } from '@/lib/validations';

interface ValidationReportProps {
  errors: ValidationError[];
  totalRows: number;
}

export default function ValidationReport({ errors, totalRows }: ValidationReportProps) {
  if (errors.length === 0) {
    return (
      <div className="panel border-[var(--color-success)]/25 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-success)] text-xs font-semibold text-white">✓</span>
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
    <div className="panel border-[var(--color-danger)]/25 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-danger)] text-xs font-semibold text-white">!</span>
        <span className="text-sm font-medium text-[var(--color-danger)]">
          校验失败，发现 {errors.length} 个错误
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        共 {totalRows} 条数据，{errors.length} 条校验未通过
      </p>
      <div className="mt-4 max-h-60 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg/80 text-left text-xs text-[var(--color-text-secondary)]">
              <th className="px-3 py-2 font-medium">行号</th>
              <th className="px-3 py-2 font-medium">字段</th>
              <th className="px-3 py-2 font-medium">错误信息</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((err, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2 text-[var(--color-text-primary)]">{err.row}</td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--color-accent)]">{err.field}</td>
                <td className="px-3 py-2 text-[var(--color-danger)]">{err.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
