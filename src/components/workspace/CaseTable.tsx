'use client';

import { Badge } from '@/components/shared/Badge';
import { getProgressBadgeKey, getProgressLabel } from '@/lib/progress';

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

export type SortField =
  | 'caseNo'
  | 'name'
  | 'resultSummary'
  | 'assignee'
  | 'progressCategory'
  | 'assetSaved'
  | 'createdAt'
  | 'updatedAt';

export type SortOrder = 'asc' | 'desc';

interface CaseTableProps {
  cases: CaseRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  sortField: SortField;
  sortOrder: SortOrder;
  selectedIds: string[];
  onPageChange: (page: number) => void;
  onSortChange: (sort: { field: SortField; order: SortOrder }) => void;
  onSaveAsset: (id: string) => void;
  onViewDetail: (id: string) => void;
  onSelectionChange: (ids: string[]) => void;
  onClearSelection: () => void;
  onBatchAction: (action: 'progressCategory' | 'assetSaved' | 'assignee') => void;
}

export default function CaseTable({
  cases,
  totalCount,
  page,
  pageSize,
  sortField,
  sortOrder,
  selectedIds,
  onPageChange,
  onSortChange,
  onSaveAsset,
  onViewDetail,
  onSelectionChange,
  onClearSelection,
  onBatchAction,
}: CaseTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const allOnPageSelected =
    cases.length > 0 && cases.every((c) => selectedIds.includes(c.id));
  const someOnPageSelected =
    cases.some((c) => selectedIds.includes(c.id)) && !allOnPageSelected;

  if (cases.length === 0) {
    return (
      <div className="panel flex items-center justify-center p-12 text-sm text-text-secondary">
        暂无用例数据
      </div>
    );
  }

  const handleHeaderCheckbox = () => {
    if (allOnPageSelected) {
      // Unselect all on this page
      onSelectionChange(selectedIds.filter((id) => !cases.some((c) => c.id === id)));
    } else {
      // Select all on this page (merge with existing)
      const next = new Set(selectedIds);
      cases.forEach((c) => next.add(c.id));
      onSelectionChange(Array.from(next));
    }
  };

  const handleRowCheckbox = (id: string, checked: boolean) => {
    if (checked) {
      if (!selectedIds.includes(id)) {
        onSelectionChange([...selectedIds, id]);
      }
    } else {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    }
  };

  const sortableHeader = (
    field: SortField,
    label: string,
    extraClassName?: string,
  ) => {
    const isActive = sortField === field;
    const nextOrder: SortOrder = isActive && sortOrder === 'asc' ? 'desc' : 'asc';
    return (
      <button
        type="button"
        onClick={() => onSortChange({ field, order: nextOrder })}
        className={`inline-flex items-center gap-1 font-medium hover:text-text-primary ${
          isActive ? 'text-text-primary' : ''
        } ${extraClassName ?? ''}`}
      >
        <span>{label}</span>
        {isActive && (
          <span aria-hidden="true" className="text-[10px]">
            {sortOrder === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    );
  };

  const ariaSortFor = (field: SortField): 'ascending' | 'descending' | 'none' =>
    sortField === field
      ? sortOrder === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';

  return (
    <div className="panel overflow-hidden">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/5 px-4 py-2 text-xs">
          <span className="font-medium text-text-primary">
            已选中 <span className="text-accent">{selectedIds.length}</span> 个用例
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onBatchAction('progressCategory')}
              className="rounded-sm px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
            >
              批量更新进展
            </button>
            <button
              type="button"
              onClick={() => onBatchAction('assignee')}
              className="rounded-sm px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
            >
              批量指派责任人
            </button>
            <button
              type="button"
              onClick={() => onBatchAction('assetSaved')}
              className="rounded-sm px-2 py-1 text-xs font-medium text-success hover:bg-success/10"
            >
              批量保存资产
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-sm px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg hover:text-text-primary"
            >
              清除选择
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg/70 text-left text-xs text-text-secondary">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="全选当前页"
                  checked={allOnPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someOnPageSelected;
                  }}
                  onChange={handleHeaderCheckbox}
                  className="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent/30"
                />
              </th>
              <th aria-sort={ariaSortFor('caseNo')} className="px-4 py-3 font-medium">{sortableHeader('caseNo', '编号')}</th>
              <th aria-sort={ariaSortFor('name')} className="px-4 py-3 font-medium">{sortableHeader('name', '名称')}</th>
              <th aria-sort={ariaSortFor('resultSummary')} className="px-4 py-3 font-medium">{sortableHeader('resultSummary', '结果概要')}</th>
              <th aria-sort={ariaSortFor('assignee')} className="px-4 py-3 font-medium">{sortableHeader('assignee', '责任人')}</th>
              <th aria-sort={ariaSortFor('progressCategory')} className="px-4 py-3 font-medium">{sortableHeader('progressCategory', '进展')}</th>
              <th aria-sort={ariaSortFor('assetSaved')} className="px-4 py-3 font-medium">{sortableHeader('assetSaved', '资产')}</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const checked = selectedIds.includes(c.id);
              return (
                <tr
                  key={c.id}
                  className={`border-b border-border transition-colors last:border-b-0 hover:bg-bg/70 ${
                    checked ? 'bg-accent/5' : ''
                  }`}
                >
                  <td className="w-10 px-3 py-3 align-middle">
                    <input
                      type="checkbox"
                      aria-label={`选择用例 ${c.caseNo}`}
                      checked={checked}
                      onChange={(e) => handleRowCheckbox(c.id, e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent/30"
                    />
                  </td>
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
                      <Badge progress={getProgressBadgeKey(c.progressCategory) ?? undefined}>
                        {getProgressLabel(c.progressCategory) ?? c.progressCategory}
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
              );
            })}
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