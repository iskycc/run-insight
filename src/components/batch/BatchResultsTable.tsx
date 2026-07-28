'use client';

import Link from 'next/link';
import { PencilSimple, ArrowSquareOut } from '@phosphor-icons/react';
import { formatDateTime } from '@/lib/date-time';
import { getProgressLabel } from '@/lib/progress';
import { isSafeHttpUrl } from '@/lib/url';
import type { CaseResultDTO } from '@/types';

const RESULT_STYLES: Record<string, string> = {
  PASS: 'bg-success/10 text-success',
  FAIL: 'bg-danger/10 text-danger',
  BLOCK: 'bg-progress-blocked/10 text-progress-blocked',
  SKIP: 'bg-text-secondary/10 text-text-secondary',
};

type BatchResultsTableProps = {
  cases: CaseResultDTO[];
  total: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  onPageChange: (page: number) => void;
  onEdit: (caseData: CaseResultDTO) => void;
};

export function BatchResultsTable({
  cases,
  total,
  page,
  pageSize,
  canEdit,
  onPageChange,
  onEdit,
}: BatchResultsTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (cases.length === 0) {
    return (
      <section className="panel px-6 py-14 text-center">
        <h2 className="text-base font-semibold text-text-primary">没有匹配的批跑结果</h2>
        <p className="mt-2 text-sm text-text-secondary">调整搜索关键词或结果类型后再试。</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border/90 bg-white shadow-[0_14px_40px_rgba(38,57,88,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <h2 className="font-semibold text-text-primary">结果明细</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            当前筛选共 {total.toLocaleString()} 条
          </p>
        </div>
        <span className="text-xs font-medium text-text-secondary">
          第 {page} / {totalPages} 页
        </span>
      </div>

      <div className="px-3 pb-3 md:overflow-x-auto md:px-0 md:pb-0">
        <table className="block w-full text-[13px] md:table">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-border/70 text-left text-xs text-text-secondary">
              <th className="px-5 py-3 font-medium">编号</th>
              <th className="px-5 py-3 font-medium">用例名称</th>
              <th className="px-5 py-3 font-medium">结果</th>
              <th className="px-5 py-3 font-medium">进展</th>
              <th className="px-5 py-3 font-medium">责任人</th>
              <th className="px-5 py-3 font-medium">更新时间</th>
              <th className="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="block space-y-3 pt-3 md:table-row-group md:space-y-0 md:pt-0">
            {cases.map((item) => (
              <tr
                key={item.id}
                className="block rounded-2xl border border-border/70 bg-white p-4 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:p-0 md:last:border-b-0 md:hover:bg-bg/40"
              >
                <td data-label="编号" className="flex justify-between gap-4 py-1.5 font-mono text-text-primary before:font-sans before:text-xs before:text-text-secondary before:content-[attr(data-label)] md:table-cell md:px-5 md:py-3 md:before:hidden">
                  {item.caseNo}
                </td>
                <td data-label="名称" className="flex justify-between gap-4 py-1.5 text-right font-medium text-text-primary before:text-left before:text-xs before:font-normal before:text-text-secondary before:content-[attr(data-label)] md:table-cell md:max-w-sm md:px-5 md:py-3 md:text-left md:before:hidden">
                  <span className="line-clamp-2">{item.name}</span>
                </td>
                <td data-label="结果" className="flex items-center justify-between gap-4 py-1.5 before:text-xs before:text-text-secondary before:content-[attr(data-label)] md:table-cell md:px-5 md:py-3 md:before:hidden">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RESULT_STYLES[item.resultSummary] ?? RESULT_STYLES.SKIP}`}>
                    {item.resultSummary}
                  </span>
                </td>
                <td data-label="进展" className="flex justify-between gap-4 py-1.5 text-text-secondary before:text-xs before:content-[attr(data-label)] md:table-cell md:px-5 md:py-3 md:before:hidden">
                  {getProgressLabel(item.progressCategory) ?? '—'}
                </td>
                <td data-label="责任人" className="flex justify-between gap-4 py-1.5 text-text-secondary before:text-xs before:content-[attr(data-label)] md:table-cell md:px-5 md:py-3 md:before:hidden">
                  {item.assignee ?? '—'}
                </td>
                <td data-label="更新时间" className="flex justify-between gap-4 py-1.5 text-text-secondary before:text-xs before:content-[attr(data-label)] md:table-cell md:px-5 md:py-3 md:before:hidden">
                  {formatDateTime(item.updatedAt)}
                </td>
                <td className="mt-2 flex items-center justify-end gap-2 border-t border-border/60 pt-3 md:mt-0 md:table-cell md:border-0 md:px-5 md:py-3">
                  {item.logUrl && isSafeHttpUrl(item.logUrl) && (
                    <a
                      href={item.logUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`打开 ${item.caseNo} 的日志`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-bg hover:text-accent"
                    >
                      <ArrowSquareOut size={16} aria-hidden="true" />
                    </a>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent/8 px-2.5 text-xs font-semibold text-accent hover:bg-accent/12"
                    >
                      <PencilSimple size={14} aria-hidden="true" />
                      编辑
                    </button>
                  )}
                  <Link
                    href={`/case/${item.id}`}
                    className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold text-text-secondary hover:bg-bg hover:text-text-primary"
                  >
                    详情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/70 bg-bg/30 px-5 py-3">
          <span className="text-xs text-text-secondary">
            每页 {pageSize} 条，共 {total.toLocaleString()} 条
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-9 rounded-lg border border-border bg-white px-3 text-xs font-medium text-text-secondary disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-9 rounded-lg border border-border bg-white px-3 text-xs font-medium text-text-secondary disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
