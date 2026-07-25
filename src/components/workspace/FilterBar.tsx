'use client';

import {
  PROGRESS_CATEGORIES,
  PROGRESS_LABELS,
  RESULT_SUMMARIES,
  type ProgressCategory,
} from '@/types';

export interface WorkspaceFilters {
  projectId: string;
  stageId: string;
  batchScopeId: string;
  progressCategory: string;
  assetSaved: string;
  search: string;
  resultSummary: string;
  assignee: string;
  rootCause: string;
  dateFrom: string;
  dateTo: string;
}

interface FilterBarProps {
  projects: { id: string; name: string }[];
  stages: { id: string; projectId: string; name: string }[];
  batches: { id: string; projectId: string; testStageId: string; name: string }[];
  selectedProjectId: string;
  selectedStageId: string;
  selectedBatchScopeId: string;
  selectedProgressCategory: string;
  selectedAssetSaved: string;
  search: string;
  resultSummary: string;
  assignee: string;
  rootCause: string;
  dateFrom: string;
  dateTo: string;
  onFilterChange: (filters: WorkspaceFilters) => void;
}

export default function FilterBar({
  projects,
  stages,
  batches,
  selectedProjectId,
  selectedStageId,
  selectedBatchScopeId,
  selectedProgressCategory,
  selectedAssetSaved,
  search,
  resultSummary,
  assignee,
  rootCause,
  dateFrom,
  dateTo,
  onFilterChange,
}: FilterBarProps) {
  const filteredStages = selectedProjectId
    ? stages.filter((s) => s.projectId === selectedProjectId)
    : [];
  const filteredBatches = selectedStageId
    ? batches.filter((b) => b.testStageId === selectedStageId)
    : [];

  const emit = (patch: Partial<WorkspaceFilters>) => {
    onFilterChange({
      projectId: selectedProjectId,
      stageId: selectedStageId,
      batchScopeId: selectedBatchScopeId,
      progressCategory: selectedProgressCategory,
      assetSaved: selectedAssetSaved,
      search,
      resultSummary,
      assignee,
      rootCause,
      dateFrom,
      dateTo,
      ...patch,
    });
  };

  return (
    <div className="panel grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="filter-search" className="text-xs font-medium text-[var(--color-text-secondary)]">
          搜索
        </label>
        <input
          id="filter-search"
          aria-label="搜索用例"
          type="search"
          value={search}
          onChange={(e) => emit({ search: e.target.value })}
          placeholder="用例编号或名称"
          className="field-control h-10 w-full px-3 text-sm"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-project" className="text-xs font-medium text-[var(--color-text-secondary)]">
          项目
        </label>
        <select
          id="filter-project"
          aria-label="项目"
          value={selectedProjectId}
          onChange={(e) =>
            emit({ projectId: e.target.value, stageId: '', batchScopeId: '' })
          }
          className="field-control h-10 w-full px-3 text-sm"
        >
          <option value="">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-stage" className="text-xs font-medium text-[var(--color-text-secondary)]">
          测试阶段
        </label>
        <select
          id="filter-stage"
          aria-label="测试阶段"
          value={selectedStageId}
          disabled={!selectedProjectId}
          onChange={(e) =>
            emit({ stageId: e.target.value, batchScopeId: '' })
          }
          className="field-control h-10 w-full px-3 text-sm"
        >
          <option value="">全部阶段</option>
          {filteredStages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-batch" className="text-xs font-medium text-[var(--color-text-secondary)]">
          批跑范围
        </label>
        <select
          id="filter-batch"
          aria-label="批跑范围"
          value={selectedBatchScopeId}
          disabled={!selectedStageId}
          onChange={(e) =>
            emit({ batchScopeId: e.target.value })
          }
          className="field-control h-10 w-full px-3 text-sm"
        >
          <option value="">全部范围</option>
          {filteredBatches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-result" className="text-xs font-medium text-[var(--color-text-secondary)]">
          结果概要
        </label>
        <select
          id="filter-result"
          aria-label="结果概要"
          value={resultSummary}
          onChange={(e) => emit({ resultSummary: e.target.value })}
          className="field-control h-10 w-full px-3 text-sm"
        >
          <option value="">全部结果</option>
          {RESULT_SUMMARIES.map((result) => (
            <option key={result} value={result}>{result}</option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-progress" className="text-xs font-medium text-[var(--color-text-secondary)]">
          进展
        </label>
        <select
          id="filter-progress"
          aria-label="进展"
          value={selectedProgressCategory}
          onChange={(e) => emit({ progressCategory: e.target.value })}
          className="field-control h-10 w-full px-3 text-sm"
        >
          <option value="">全部进展</option>
          {PROGRESS_CATEGORIES.map((p: ProgressCategory) => (
            <option key={p} value={p}>
              {PROGRESS_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-asset" className="text-xs font-medium text-[var(--color-text-secondary)]">
          资产状态
        </label>
        <select
          id="filter-asset"
          aria-label="资产状态"
          value={selectedAssetSaved}
          onChange={(e) => emit({ assetSaved: e.target.value })}
          className="field-control h-10 w-full px-3 text-sm"
        >
          <option value="">全部</option>
          <option value="true">已保存</option>
          <option value="false">未保存</option>
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-assignee" className="text-xs font-medium text-[var(--color-text-secondary)]">
          责任人
        </label>
        <input
          id="filter-assignee"
          aria-label="责任人"
          value={assignee}
          onChange={(e) => emit({ assignee: e.target.value })}
          placeholder="输入责任人"
          className="field-control h-10 w-full px-3 text-sm"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-root-cause" className="text-xs font-medium text-[var(--color-text-secondary)]">
          根因
        </label>
        <input
          id="filter-root-cause"
          aria-label="根因"
          value={rootCause}
          onChange={(e) => emit({ rootCause: e.target.value })}
          placeholder="输入根因关键词"
          className="field-control h-10 w-full px-3 text-sm"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-date-from" className="text-xs font-medium text-[var(--color-text-secondary)]">
          创建日期从
        </label>
        <input
          id="filter-date-from"
          aria-label="创建日期从"
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => emit({ dateFrom: e.target.value })}
          className="field-control h-10 w-full px-3 text-sm"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-date-to" className="text-xs font-medium text-[var(--color-text-secondary)]">
          创建日期至
        </label>
        <input
          id="filter-date-to"
          aria-label="创建日期至"
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => emit({ dateTo: e.target.value })}
          className="field-control h-10 w-full px-3 text-sm"
        />
      </div>

      <div className="flex items-end">
        <button
          type="button"
          onClick={() => onFilterChange({
            projectId: '',
            stageId: '',
            batchScopeId: '',
            progressCategory: '',
            assetSaved: '',
            search: '',
            resultSummary: '',
            assignee: '',
            rootCause: '',
            dateFrom: '',
            dateTo: '',
          })}
          className="h-10 rounded-md px-3 text-sm text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
        >
          清除筛选
        </button>
      </div>
    </div>
  );
}
