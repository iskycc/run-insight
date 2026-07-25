'use client';

import { PROGRESS_CATEGORIES, PROGRESS_LABELS, type ProgressCategory } from '@/types';

interface FilterBarProps {
  projects: { id: string; name: string }[];
  stages: { id: string; projectId: string; name: string }[];
  batches: { id: string; projectId: string; testStageId: string; name: string }[];
  selectedProjectId: string;
  selectedStageId: string;
  selectedBatchScopeId: string;
  selectedProgressCategory: string;
  selectedAssetSaved: string;
  onFilterChange: (filters: {
    projectId: string;
    stageId: string;
    batchScopeId: string;
    progressCategory: string;
    assetSaved: string;
  }) => void;
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
  onFilterChange,
}: FilterBarProps) {
  const filteredStages = selectedProjectId
    ? stages.filter((s) => s.projectId === selectedProjectId)
    : [];
  const filteredBatches = selectedStageId
    ? batches.filter((b) => b.testStageId === selectedStageId)
    : [];

  const emit = (patch: Partial<{
    projectId: string;
    stageId: string;
    batchScopeId: string;
    progressCategory: string;
    assetSaved: string;
  }>) => {
    onFilterChange({
      projectId: selectedProjectId,
      stageId: selectedStageId,
      batchScopeId: selectedBatchScopeId,
      progressCategory: selectedProgressCategory,
      assetSaved: selectedAssetSaved,
      ...patch,
    });
  };

  return (
    <div className="panel grid gap-4 p-4 sm:grid-cols-3 lg:grid-cols-5">
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
    </div>
  );
}