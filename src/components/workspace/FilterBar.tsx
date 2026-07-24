'use client';

interface FilterBarProps {
  projects: { id: string; name: string }[];
  stages: { id: string; projectId: string; name: string }[];
  batches: { id: string; projectId: string; testStageId: string; name: string }[];
  selectedProjectId: string;
  selectedStageId: string;
  selectedBatchScopeId: string;
  onFilterChange: (filters: { projectId: string; stageId: string; batchScopeId: string }) => void;
}

export default function FilterBar({
  projects,
  stages,
  batches,
  selectedProjectId,
  selectedStageId,
  selectedBatchScopeId,
  onFilterChange,
}: FilterBarProps) {
  const filteredStages = selectedProjectId
    ? stages.filter((s) => s.projectId === selectedProjectId)
    : [];
  const filteredBatches = selectedStageId
    ? batches.filter((b) => b.testStageId === selectedStageId)
    : [];

  return (
    <div className="panel grid gap-4 p-4 sm:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="filter-project" className="text-xs font-medium text-[var(--color-text-secondary)]">
          项目
        </label>
        <select
          id="filter-project"
          aria-label="项目"
          value={selectedProjectId}
          onChange={(e) =>
            onFilterChange({ projectId: e.target.value, stageId: '', batchScopeId: '' })
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
            onFilterChange({ projectId: selectedProjectId, stageId: e.target.value, batchScopeId: '' })
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
            onFilterChange({ projectId: selectedProjectId, stageId: selectedStageId, batchScopeId: e.target.value })
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
    </div>
  );
}
