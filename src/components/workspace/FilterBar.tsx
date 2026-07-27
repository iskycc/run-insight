'use client';

import { useMemo, useState } from 'react';
import {
  BookmarkSimple,
  Briefcase,
  Funnel,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react';
import {
  PROGRESS_CATEGORIES,
  PROGRESS_LABELS,
  RESULT_SUMMARIES,
  type ProgressCategory,
} from '@/types';
import { Select } from '@/components/shared/Select';

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

type Chip = {
  key: keyof WorkspaceFilters;
  label: string;
  value: string;
};

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
  const hasAdvancedFilters = Boolean(
    selectedStageId ||
      selectedBatchScopeId ||
      selectedAssetSaved ||
      assignee ||
      rootCause ||
      dateFrom ||
      dateTo,
  );
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedFilters);

  const filteredStages = selectedProjectId
    ? stages.filter((stage) => stage.projectId === selectedProjectId)
    : [];
  const filteredBatches = selectedStageId
    ? batches.filter((batch) => batch.testStageId === selectedStageId)
    : [];

  const current: WorkspaceFilters = {
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
  };

  const emit = (patch: Partial<WorkspaceFilters>) => {
    onFilterChange({ ...current, ...patch });
  };

  const activeFilterCount = useMemo(
    () => Object.values(current).filter(Boolean).length,
    // The primitive filter values are the intended memoization inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
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
    ],
  );

  const clearFilters = () => {
    setAdvancedOpen(false);
    onFilterChange({
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
    });
  };

  const selectedStageName =
    filteredStages.find((stage) => stage.id === selectedStageId)?.name ?? '';
  const selectedBatchName =
    filteredBatches.find((batch) => batch.id === selectedBatchScopeId)?.name ?? '';
  const progressLabel = selectedProgressCategory
    ? PROGRESS_LABELS[selectedProgressCategory as ProgressCategory]
    : '';

  const chips: Chip[] = [
    {
      key: 'progressCategory',
      label: '进展',
      value: progressLabel,
    },
    {
      key: 'assetSaved',
      label: '资产状态',
      value:
        selectedAssetSaved === 'true'
          ? '已保存'
            : selectedAssetSaved === 'false'
              ? '未保存'
              : '',
    },
    {
      key: 'stageId',
      label: '测试阶段',
      value: selectedStageName,
    },
    {
      key: 'batchScopeId',
      label: '批跑范围',
      value: selectedBatchName,
    },
    {
      key: 'resultSummary',
      label: '结果概要',
      value: resultSummary,
    },
    {
      key: 'dateFrom',
      label: '创建日期',
      value: dateFrom || dateTo ? `${dateFrom || '不限'} ~ ${dateTo || '不限'}` : '',
    },
  ];
  const activeChips = chips.filter((chip) => chip.value);

  const mainControl =
    'field-control h-12 w-full rounded-[10px] border-border bg-surface-solid px-4 text-sm shadow-none';
  const advancedControl =
    'field-control h-11 w-full rounded-[10px] border-border bg-surface-solid px-3 text-sm font-normal shadow-none';

  return (
    <section
      aria-label="用例筛选"
      className="rounded-[18px] border border-border/90 bg-surface-solid p-5 shadow-[0_12px_36px_rgba(38,57,88,0.055)] sm:p-6"
    >
      <div className="grid gap-3 lg:grid-cols-[1.05fr_1.12fr_1fr_auto]">
        <label className="relative block min-w-0">
          <span className="sr-only">搜索用例</span>
          <MagnifyingGlass
            size={19}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            aria-label="搜索用例"
            type="search"
            value={search}
            onChange={(event) => emit({ search: event.target.value })}
            placeholder="搜索用例编号或名称"
            className={`${mainControl} pl-11 font-normal`}
          />
        </label>

        <div className="relative min-w-0">
          <Briefcase
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-primary"
          />
          <Select
            aria-label="项目"
            value={selectedProjectId}
            onChange={(event) =>
              emit({
                projectId: event.target.value,
                stageId: '',
                batchScopeId: '',
              })
            }
            className={`${mainControl} pl-11 font-semibold`}
            options={[
              { value: '', label: '全部项目' },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
        </div>

        <div className="relative min-w-0">
          <BookmarkSimple
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-text-secondary"
          />
          <Select
            aria-label="进展"
            value={selectedProgressCategory}
            onChange={(event) => emit({ progressCategory: event.target.value })}
            className={`${mainControl} pl-11 font-semibold`}
            options={[
              { value: '', label: '全部进展' },
              ...PROGRESS_CATEGORIES.map((category) => ({
                value: category,
                label: PROGRESS_LABELS[category],
              })),
            ]}
          />
        </div>

        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls="workspace-advanced-filters"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-accent px-7 text-sm font-medium text-white shadow-[0_8px_22px_rgba(17,96,242,0.18)] transition hover:bg-accent-hover"
        >
          <Funnel size={18} weight="bold" aria-hidden="true" />
          筛选
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 text-[11px]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {activeChips.length === 0 && (
          <span className="text-xs text-text-secondary">未启用附加筛选条件</span>
        )}
        {activeChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-label={`清除${chip.label}筛选`}
            onClick={() => {
              const patch: Partial<WorkspaceFilters> = { [chip.key]: '' };
              if (chip.key === 'stageId') patch.batchScopeId = '';
              if (chip.key === 'dateFrom') patch.dateTo = '';
              emit(patch);
            }}
            className="inline-flex min-h-8 items-center gap-2 rounded-[8px] border border-border/80 bg-bg/55 px-3 text-xs font-normal text-text-secondary transition hover:border-accent/25 hover:bg-surface-solid"
          >
            <span>
              {chip.label}：{chip.value}
            </span>
            <X size={12} weight="bold" aria-hidden="true" />
          </button>
        ))}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto min-h-8 px-2 text-xs font-semibold text-accent hover:text-accent-hover"
          >
            清除筛选
          </button>
        )}
      </div>

      <div
        id="workspace-advanced-filters"
        className={`${advancedOpen ? 'grid' : 'hidden'} mt-5 gap-3 border-t border-border/60 pt-5 sm:grid-cols-2 lg:grid-cols-4`}
      >
        <Select
            label="测试阶段"
            aria-label="测试阶段"
            value={selectedStageId}
            disabled={!selectedProjectId}
            onChange={(event) =>
              emit({ stageId: event.target.value, batchScopeId: '' })
            }
            className={advancedControl}
            options={[
              { value: '', label: '全部阶段' },
              ...filteredStages.map((stage) => ({ value: stage.id, label: stage.name })),
            ]}
          />

        <Select
            label="批跑范围"
            aria-label="批跑范围"
            value={selectedBatchScopeId}
            disabled={!selectedStageId}
            onChange={(event) => emit({ batchScopeId: event.target.value })}
            className={advancedControl}
            options={[
              { value: '', label: '全部范围' },
              ...filteredBatches.map((batch) => ({ value: batch.id, label: batch.name })),
            ]}
          />

        <Select
            label="结果概要"
            aria-label="结果概要"
            value={resultSummary}
            onChange={(event) => emit({ resultSummary: event.target.value })}
            className={advancedControl}
            options={[
              { value: '', label: '全部结果' },
              ...RESULT_SUMMARIES.map((result) => ({ value: result, label: result })),
            ]}
          />

        <Select
            label="资产状态"
            aria-label="资产状态"
            value={selectedAssetSaved}
            onChange={(event) => emit({ assetSaved: event.target.value })}
            className={advancedControl}
            options={[
              { value: '', label: '全部' },
              { value: 'true', label: '已保存' },
              { value: 'false', label: '未保存' },
            ]}
          />

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">责任人</span>
          <input
            aria-label="责任人"
            value={assignee}
            onChange={(event) => emit({ assignee: event.target.value })}
            placeholder="输入责任人"
            className={advancedControl}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">根因</span>
          <input
            aria-label="根因"
            value={rootCause}
            onChange={(event) => emit({ rootCause: event.target.value })}
            placeholder="输入根因关键词"
            className={advancedControl}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">创建日期从</span>
          <input
            aria-label="创建日期从"
            type="date"
            lang="zh-CN"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => emit({ dateFrom: event.target.value })}
            className={advancedControl}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">创建日期至</span>
          <input
            aria-label="创建日期至"
            type="date"
            lang="zh-CN"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => emit({ dateTo: event.target.value })}
            className={advancedControl}
          />
        </label>
      </div>
    </section>
  );
}
