'use client';

import { Badge } from '@/components/shared/Badge';
import { PROGRESS_LABELS } from '@/types';

const PROGRESS_MAP: Record<string, 'pending' | 'analyzing' | 'located' | 'fixed' | 'not-issue' | 'blocked'> = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  LOCATED: 'located',
  FIXED: 'fixed',
  NOT_ISSUE: 'not-issue',
  BLOCKED: 'blocked',
};

interface CaseRow {
  id: string;
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string;
  projectId: string;
  testStageId: string;
  batchScopeId: string;
  assignee?: string;
  progressCategory?: string;
  rootCause?: string;
  mrOrTicket?: string;
  assetSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CaseTableProps {
  cases: CaseRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSortChange: (sort: { field: string; order: 'asc' | 'desc' }) => void;
  onSaveAsset: (id: string) => void;
  onViewDetail: (id: string) => void;
}

export default function CaseTable({
  cases,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onSortChange,
  onSaveAsset,
  onViewDetail,
}: CaseTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);

  if (cases.length === 0) {
    return (
      <div className="panel flex items-center justify-center p-12 text-sm text-text-secondary">
        暂无用例数据
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg/70 text-left text-xs text-text-secondary">
              <th className="px-4 py-3 font-medium">
                <button
                  onClick={() => onSortChange({ field: 'caseNo', order: 'asc' })}
                  className="font-medium hover:text-text-primary"
                >
                  编号
                </button>
              </th>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">结果概要</th>
              <th className="px-4 py-3 font-medium">责任人</th>
              <th className="px-4 py-3 font-medium">进展</th>
              <th className="px-4 py-3 font-medium">资产</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-bg/70"
              >
                <td className="px-4 py-3 font-mono text-xs font-medium text-accent">
                  {c.caseNo}
                </td>
                <td className="px-4 py-3 font-medium text-text-primary">{c.name}</td>
                <td className="max-w-[240px] truncate px-4 py-3 text-text-secondary">
                  {c.resultSummary}
                </td>
                <td className="px-4 py-3 text-text-secondary">{c.assignee || '—'}</td>
                <td className="px-4 py-3">
                  {c.progressCategory ? (
                    <Badge progress={PROGRESS_MAP[c.progressCategory]}>
                      {PROGRESS_LABELS[c.progressCategory as keyof typeof PROGRESS_LABELS] ?? c.progressCategory}
                    </Badge>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.assetSaved ? (
                    <span className="text-xs font-medium text-success">已保存</span>
                  ) : (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="查看详情"
                      onClick={() => onViewDetail(c.id)}
                      className="rounded-sm px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10 hover:text-accent-hover"
                    >
                      详情
                    </button>
                    {c.progressCategory && !c.assetSaved && (
                      <button
                        aria-label="保存资产"
                        onClick={() => onSaveAsset(c.id)}
                        className="rounded-sm px-2 py-1 text-xs font-medium text-success hover:bg-success/10"
                      >
                        保存资产
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border bg-bg/40 px-4 py-3">
          <span className="text-xs text-text-secondary">
            共 {totalCount} 条，第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-md border border-border bg-surface-solid px-3 py-1 text-xs text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-md border border-border bg-surface-solid px-3 py-1 text-xs text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
