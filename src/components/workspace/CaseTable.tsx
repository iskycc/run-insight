'use client';

import { formatDateTime } from '@/lib/date-time';
import { getProgressLabel } from '@/lib/progress';
import { ArrowRight, CaretDown, CaretUp } from '@phosphor-icons/react';

interface CaseRow {
  id: string;
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string;
  projectId: string;
  projectName?: string;
  testStageId: string;
  testStageName?: string;
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

const MOBILE_SORT_OPTIONS: { value: string; label: string; field: SortField; order: SortOrder }[] = [
  { value: 'createdAt:desc', label: '最近创建', field: 'createdAt', order: 'desc' },
  { value: 'updatedAt:desc', label: '最近更新', field: 'updatedAt', order: 'desc' },
  { value: 'caseNo:asc', label: '编号升序', field: 'caseNo', order: 'asc' },
  { value: 'progressCategory:asc', label: '按进展', field: 'progressCategory', order: 'asc' },
];

const RESULT_TONES: Record<string, string> = {
  PASS: 'bg-success',
  FAIL: 'bg-danger',
  BLOCK: 'bg-progress-blocked',
  SKIP: 'bg-text-secondary',
};

const RESULT_LABELS: Record<string, string> = {
  PASS: '通过',
  FAIL: '失败',
  BLOCK: '阻塞',
  SKIP: '跳过',
};

const PROGRESS_TONES: Record<string, string> = {
  PENDING: 'bg-text-secondary',
  ANALYZING: 'bg-warning',
  LOCATED: 'bg-danger',
  FIXED: 'bg-success',
  NOT_ISSUE: 'bg-info',
  BLOCKED: 'bg-progress-blocked',
};

interface CaseTableProps {
  canEdit: boolean;
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
  canEdit,
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
      <section className="rounded-[24px] border border-white/80 bg-white/90 px-6 py-12 text-center shadow-[0_16px_48px_rgba(38,57,88,0.08)] backdrop-blur-xl">
        <h2 className="text-base font-semibold text-text-primary">暂无用例数据</h2>
        <p className="mt-1.5 text-sm text-text-secondary">尝试调整筛选条件，或选择其他项目范围。</p>
      </section>
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
          sortOrder === 'asc'
            ? <CaretUp size={12} weight="bold" aria-hidden="true" />
            : <CaretDown size={12} weight="bold" aria-hidden="true" />
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

  const mobileSortValue = MOBILE_SORT_OPTIONS.find(
    (option) => option.field === sortField && option.order === sortOrder,
  )?.value ?? `${sortField}:${sortOrder}`;

  return (
    <section className="overflow-hidden rounded-[18px] border border-border/90 bg-surface-solid shadow-[0_12px_36px_rgba(38,57,88,0.055)]">
      <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-text-primary">最近用例</h2>
          <p className="sr-only">共 {totalCount.toLocaleString()} 条结果</p>
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="hidden items-center gap-2 text-sm font-medium text-accent transition hover:text-accent-hover disabled:opacity-40 md:inline-flex"
        >
          查看全部
          <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </button>
        <label className="flex items-center gap-2 text-xs font-medium text-text-secondary md:hidden">
          <span>排序</span>
          <select
            aria-label="移动端排序"
            value={mobileSortValue}
            onChange={(event) => {
              const option = MOBILE_SORT_OPTIONS.find((item) => item.value === event.target.value);
              if (option) onSortChange({ field: option.field, order: option.order });
            }}
            className="field-control h-9 rounded-[9px] bg-surface-solid px-2.5 text-xs"
          >
            {!MOBILE_SORT_OPTIONS.some((option) => option.value === mobileSortValue) && (
              <option value={mobileSortValue}>当前排序</option>
            )}
            {MOBILE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {canEdit && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/10 bg-accent/5 px-4 py-3 text-xs sm:px-5">
          <span className="font-medium text-text-primary">
            已选中 <span className="text-accent">{selectedIds.length}</span> 个用例
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onBatchAction('progressCategory')}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10"
            >
              批量更新进展
            </button>
            <button
              type="button"
              onClick={() => onBatchAction('assignee')}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10"
            >
              批量指派责任人
            </button>
            <button
              type="button"
              onClick={() => onBatchAction('assetSaved')}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/10"
            >
              批量保存资产
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-white hover:text-text-primary"
            >
              清除选择
            </button>
          </div>
        </div>
      )}

      <div className="px-3 pb-3 md:overflow-x-auto md:px-0 md:pb-0">
        <table className="block w-full text-[13px] md:table">
          <thead className="hidden md:table-header-group">
            <tr className="border-y border-border/60 text-left text-xs text-text-secondary">
              {canEdit && (
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
              )}
              <th aria-sort={ariaSortFor('caseNo')} className="px-4 py-3 font-medium">{sortableHeader('caseNo', '编号')}</th>
              <th aria-sort={ariaSortFor('name')} className="px-4 py-3 font-medium">{sortableHeader('name', '名称')}</th>
              <th className="px-4 py-3 font-medium">项目</th>
              <th className="px-4 py-3 font-medium">测试阶段</th>
              <th aria-sort={ariaSortFor('resultSummary')} className="px-4 py-3 font-medium">{sortableHeader('resultSummary', '结果')}</th>
              <th aria-sort={ariaSortFor('progressCategory')} className="px-4 py-3 font-medium">{sortableHeader('progressCategory', '进展')}</th>
              <th aria-sort={ariaSortFor('assignee')} className="px-4 py-3 font-medium">{sortableHeader('assignee', '负责人')}</th>
              <th aria-sort={ariaSortFor('updatedAt')} className="px-4 py-3 font-medium">{sortableHeader('updatedAt', '更新时间')}</th>
            </tr>
          </thead>
          <tbody className="block space-y-3 pt-3 md:table-row-group md:space-y-0 md:pt-0">
            {cases.map((c) => {
              const checked = selectedIds.includes(c.id);
              return (
                <tr
                  key={c.id}
                  className={`group block rounded-2xl border p-4 transition-colors md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:p-0 md:last:border-b-0 md:hover:bg-bg/45 ${
                    checked
                      ? 'border-accent/25 bg-accent/5 md:border-border/60'
                      : 'border-border/70 bg-white/70 md:border-border/60 md:bg-transparent'
                  }`}
                >
                  {canEdit && (
                    <td className="mb-2 block md:mb-0 md:table-cell md:w-10 md:px-3 md:py-2.5 md:align-middle">
                      <input
                        type="checkbox"
                        aria-label={`选择用例 ${c.caseNo}`}
                        checked={checked}
                        onChange={(e) => handleRowCheckbox(c.id, e.target.checked)}
                        className="h-4 w-4 cursor-pointer rounded border-border text-accent focus:ring-accent/30"
                      />
                    </td>
                  )}
                  <td
                    data-label="编号"
                    className="flex items-center justify-between gap-4 py-1.5 font-mono text-[13px] text-text-primary before:font-sans before:text-xs before:font-medium before:text-text-secondary before:content-[attr(data-label)] md:table-cell md:px-4 md:py-2.5 md:before:hidden"
                  >
                    {c.caseNo}
                  </td>
                  <td
                    data-label="名称"
                    className="flex items-start justify-between gap-4 py-1.5 text-right font-medium text-text-primary before:shrink-0 before:text-xs before:font-medium before:text-text-secondary before:content-[attr(data-label)] md:table-cell md:px-4 md:py-2.5 md:text-left md:before:hidden"
                  >
                    {c.name}
                  </td>
                  <td
                    data-label="项目"
                    className="flex items-center justify-between gap-4 py-1.5 text-text-secondary before:text-xs before:font-medium before:content-[attr(data-label)] md:table-cell md:px-4 md:py-2.5 md:before:hidden"
                  >
                    {c.projectName || '—'}
                  </td>
                  <td
                    data-label="测试阶段"
                    className="flex items-center justify-between gap-4 py-1.5 text-text-secondary before:text-xs before:font-medium before:content-[attr(data-label)] md:table-cell md:px-4 md:py-2.5 md:before:hidden"
                  >
                    {c.testStageName || '—'}
                  </td>
                  <td
                    data-label="结果"
                    className="flex items-center justify-between gap-4 py-1.5 text-text-secondary before:text-xs before:font-medium before:content-[attr(data-label)] md:table-cell md:px-4 md:py-2.5 md:before:hidden"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${RESULT_TONES[c.resultSummary] ?? 'bg-text-secondary'}`}
                      />
                      {RESULT_LABELS[c.resultSummary] ?? c.resultSummary}
                    </span>
                  </td>
                  <td
                    data-label="进展"
                    className="flex items-center justify-between gap-4 py-1.5 before:text-xs before:font-medium before:text-text-secondary before:content-[attr(data-label)] md:table-cell md:px-4 md:py-2.5 md:before:hidden"
                  >
                    {c.progressCategory ? (
                      <span className="inline-flex items-center gap-2 text-text-primary">
                        <span
                          className={`h-2 w-2 rounded-full ${PROGRESS_TONES[c.progressCategory] ?? 'bg-text-secondary'}`}
                        />
                        {getProgressLabel(c.progressCategory) ?? c.progressCategory}
                      </span>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td
                    data-label="负责人"
                    className="flex items-center justify-between gap-4 py-1.5 before:text-xs before:font-medium before:text-text-secondary before:content-[attr(data-label)] md:table-cell md:px-4 md:py-2.5 md:before:hidden"
                  >
                    {c.assignee ? (
                      <span className="inline-flex items-center gap-2 text-text-primary">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#34405a] text-[10px] font-semibold text-white">
                          {c.assignee.slice(0, 1).toUpperCase()}
                        </span>
                        {c.assignee}
                      </span>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td
                    data-label="更新时间"
                    className="flex items-center justify-between gap-4 py-1.5 text-[13px] text-text-secondary before:text-xs before:font-medium before:content-[attr(data-label)] md:relative md:table-cell md:px-4 md:py-2.5 md:before:hidden"
                  >
                    <span>{formatDateTime(c.updatedAt)}</span>
                    <div className="mt-2 flex items-center justify-end gap-2 border-t border-border/60 pt-3 md:absolute md:right-3 md:top-1/2 md:mt-0 md:-translate-y-1/2 md:border-0 md:bg-white/95 md:p-1 md:opacity-0 md:shadow-sm md:transition md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <button
                        aria-label="查看详情"
                        onClick={() => onViewDetail(c.id)}
                        className="rounded-lg bg-accent/8 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/12 hover:text-accent-hover"
                      >
                        详情
                      </button>
                      {canEdit && c.progressCategory && !c.assetSaved && (
                        <button
                          aria-label="保存资产"
                          onClick={() => onSaveAsset(c.id)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/10"
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
        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-bg/30 px-4 py-3 sm:px-5">
          <span className="text-xs text-text-secondary">
            共 {totalCount} 条，第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-9 rounded-[9px] border border-border bg-surface-solid px-3 text-xs font-medium text-text-secondary transition hover:border-accent/30 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-9 rounded-[9px] border border-border bg-surface-solid px-3 text-xs font-medium text-text-secondary transition hover:border-accent/30 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
