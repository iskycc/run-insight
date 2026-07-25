'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FilterBar, { type WorkspaceFilters } from '@/components/workspace/FilterBar';
import MetricCards from '@/components/workspace/MetricCards';
import ProgressDistribution from '@/components/dashboard/ProgressDistribution';
import CaseTable, {
  type SortField,
  type SortOrder,
} from '@/components/workspace/CaseTable';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { SaveAssetModal } from '@/components/shared/SaveAssetModal';
import {
  BatchActionModal,
  type BatchActionType,
  type BatchUpdates,
} from '@/components/shared/BatchActionModal';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { fetchJson, ApiError } from '@/lib/fetch';
import type {
  CaseResultDTO,
  CasesResponse,
  DashboardStatsResponse,
  ProjectDTO,
  TestStageDTO,
  BatchScopeDTO,
  ProjectsResponse,
  StagesResponse,
  BatchesResponse,
  SaveAssetResponse,
  BatchUpdateResponse,
} from '@/types';

const SORT_FIELDS: SortField[] = [
  'caseNo',
  'name',
  'resultSummary',
  'assignee',
  'progressCategory',
  'assetSaved',
  'createdAt',
  'updatedAt',
];

function WorkspaceContent() {
  const { user } = useAuth();
  const router = useRouter();
  const initialSearchParams = useSearchParams();
  const { showToast } = useToast();

  // Filter state
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [stages, setStages] = useState<{ id: string; projectId: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; projectId: string; testStageId: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => initialSearchParams.get('projectId') ?? '',
  );
  const [selectedStageId, setSelectedStageId] = useState(
    () => initialSearchParams.get('testStageId') ?? '',
  );
  const [selectedBatchScopeId, setSelectedBatchScopeId] = useState(
    () => initialSearchParams.get('batchScopeId') ?? '',
  );
  const canEdit =
    projects.find((project) => project.id === selectedProjectId)?.canEdit ?? false;
  const [selectedProgressCategory, setSelectedProgressCategory] = useState(
    () => initialSearchParams.get('progressCategory') ?? '',
  );
  const [selectedAssetSaved, setSelectedAssetSaved] = useState(
    () => initialSearchParams.get('assetSaved') ?? '',
  );
  const [search, setSearch] = useState(() => initialSearchParams.get('search') ?? '');
  const [resultSummary, setResultSummary] = useState(
    () => initialSearchParams.get('resultSummary') ?? '',
  );
  const [assignee, setAssignee] = useState(
    () => initialSearchParams.get('assignee') ?? '',
  );
  const [rootCause, setRootCause] = useState(
    () => initialSearchParams.get('rootCause') ?? '',
  );
  const [dateFrom, setDateFrom] = useState(
    () => initialSearchParams.get('dateFrom') ?? '',
  );
  const [dateTo, setDateTo] = useState(
    () => initialSearchParams.get('dateTo') ?? '',
  );

  // Cases state
  const [cases, setCases] = useState<CaseResultDTO[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(
    () => Math.max(1, Number(initialSearchParams.get('page')) || 1),
  );
  const [sortField, setSortField] = useState<SortField>(() => {
    const requested = initialSearchParams.get('sortField');
    return requested && SORT_FIELDS.includes(requested as SortField)
      ? requested as SortField
      : 'createdAt';
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    () => initialSearchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  );
  const pageSize = 20;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Metrics state
  const [metrics, setMetrics] = useState<DashboardStatsResponse | null>(null);

  // Save asset modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseResultDTO | null>(null);

  // Batch action modal state
  const [batchAction, setBatchAction] = useState<BatchActionType | null>(null);

  // Export state
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'xlsx' | null>(null);
  const exportAnchorRef = useRef<HTMLAnchorElement | null>(null);

  // Keep filters, paging and sorting in the URL so the current view can be
  // refreshed or shared. replaceState avoids adding a history entry per keypress.
  useEffect(() => {
    const params = new URLSearchParams();
    const values: Record<string, string> = {
      projectId: selectedProjectId,
      testStageId: selectedStageId,
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
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
    }
    if (page > 1) params.set('page', String(page));
    if (sortField !== 'createdAt') params.set('sortField', sortField);
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/workspace?${query}` : '/workspace');
  }, [
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
    page,
    sortField,
    sortOrder,
  ]);

  // Fetch projects on mount
  useEffect(() => {
    async function fetchFilterData() {
      try {
        const data = await fetchJson<ProjectsResponse>('/api/projects');
        setProjects(data.projects);
      } catch (error) {
        console.error(error);
      }
    }
    fetchFilterData();
  }, []);

  // Fetch stages when project changes
  useEffect(() => {
    async function fetchStages() {
      if (!selectedProjectId) {
        setStages([]);
        setBatches([]);
        return;
      }
      try {
        const data = await fetchJson<StagesResponse>(`/api/projects/${selectedProjectId}/stages`);
        setStages(data.stages.map((s: TestStageDTO) => ({
          id: s.id,
          projectId: s.projectId,
          name: s.name,
        })));
      } catch (error) {
        console.error(error);
      }
    }
    fetchStages();
  }, [selectedProjectId]);

  // Fetch batches when stage changes
  useEffect(() => {
    async function fetchBatches() {
      if (!selectedStageId) {
        setBatches([]);
        return;
      }
      try {
        const data = await fetchJson<BatchesResponse>(`/api/stages/${selectedStageId}/batches`);
        setBatches(data.batches.map((b: BatchScopeDTO) => ({
          id: b.id,
          projectId: b.projectId,
          testStageId: b.testStageId,
          name: b.name,
        })));
      } catch (error) {
        console.error(error);
      }
    }
    fetchBatches();
  }, [selectedStageId]);

  const getCasesAndMetrics = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set('projectId', selectedProjectId);
    if (selectedStageId) params.set('testStageId', selectedStageId);
    if (selectedBatchScopeId) params.set('batchScopeId', selectedBatchScopeId);
    if (selectedProgressCategory) params.set('progressCategory', selectedProgressCategory);
    if (selectedAssetSaved) params.set('assetSaved', selectedAssetSaved);
    if (search) params.set('search', search);
    if (resultSummary) params.set('resultSummary', resultSummary);
    if (assignee) params.set('assignee', assignee);
    if (rootCause) params.set('rootCause', rootCause);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('sortField', sortField);
    params.set('sortOrder', sortOrder);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const queryString = params.toString();
    const [casesData, statsData] = await Promise.all([
      fetchJson<CasesResponse>(`/api/cases?${queryString}`),
      fetchJson<DashboardStatsResponse>(`/api/stats/dashboard?${queryString}`),
    ]);

    return { casesData, statsData };
  }, [
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
    sortField,
    sortOrder,
    page,
  ]);

  const fetchCases = useCallback(async () => {
    try {
      const { casesData, statsData } = await getCasesAndMetrics();
      setCases(casesData.cases);
      setTotalCount(casesData.total);
      setMetrics(statsData);
    } catch (error) {
      console.error(error);
    }
  }, [getCasesAndMetrics]);

  useEffect(() => {
    let isActive = true;

    async function loadCases() {
      try {
        const { casesData, statsData } = await getCasesAndMetrics();
        if (!isActive) return;

        setCases(casesData.cases);
        setTotalCount(casesData.total);
        setMetrics(statsData);
      } catch (error) {
        console.error(error);
      }
    }

    loadCases();

    return () => {
      isActive = false;
    };
  }, [getCasesAndMetrics]);

  // Filter change handler — also clears the current selection since selected
  // case ids may no longer match the visible list.
  const handleFilterChange = useCallback(
    (filters: WorkspaceFilters) => {
      setSelectedProjectId(filters.projectId);
      setSelectedStageId(filters.stageId);
      setSelectedBatchScopeId(filters.batchScopeId);
      setSelectedProgressCategory(filters.progressCategory);
      setSelectedAssetSaved(filters.assetSaved);
      setSearch(filters.search);
      setResultSummary(filters.resultSummary);
      setAssignee(filters.assignee);
      setRootCause(filters.rootCause);
      setDateFrom(filters.dateFrom);
      setDateTo(filters.dateTo);
      setPage(1);
      setSelectedIds([]);
    },
    []
  );

  // Save asset handlers
  const handleSaveAsset = useCallback((caseId: string) => {
    if (!canEdit) return;
    const c = cases.find((item) => item.id === caseId);
    if (c) {
      setSelectedCase(c);
      setSaveModalOpen(true);
    }
  }, [canEdit, cases]);

  const handleSaveAssetConfirm = useCallback(async (caseId: string) => {
    if (!canEdit) return;
    try {
      await fetchJson<SaveAssetResponse>(`/api/cases/${caseId}/save-asset`, { method: 'PATCH' });
      setSaveModalOpen(false);
      setSelectedCase(null);
      showToast({ message: '资产已保存', type: 'success' });
      fetchCases();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : '保存资产失败';
      showToast({ message, type: 'error' });
    }
  }, [canEdit, fetchCases, showToast]);

  // View detail handler — navigate to case detail page
  const handleViewDetail = useCallback((id: string) => {
    router.push(`/case/${id}`);
  }, [router]);

  // Sort handler
  const handleSortChange = useCallback(
    (sort: { field: SortField; order: SortOrder }) => {
      setSortField(sort.field);
      setSortOrder(sort.order);
      setPage(1);
    },
    []
  );

  // Selection handlers
  const handleSelectionChange = useCallback((ids: string[]) => {
    if (!canEdit) return;
    setSelectedIds(ids);
  }, [canEdit]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  // Batch action trigger — opens the modal
  const handleBatchAction = useCallback((action: BatchActionType) => {
    if (!canEdit || selectedIds.length === 0) return;
    setBatchAction(action);
  }, [canEdit, selectedIds.length]);

  // Batch action confirmation — calls PATCH /api/cases
  const handleBatchConfirm = useCallback(async (updates: BatchUpdates) => {
    if (!canEdit) return;
    try {
      const res = await fetchJson<BatchUpdateResponse>('/api/cases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseIds: selectedIds,
          updates,
        }),
      });
      setBatchAction(null);
      setSelectedIds([]);
      showToast({
        message: `已批量更新 ${res.updated} 个用例`,
        type: 'success',
      });
      fetchCases();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : '批量更新失败';
      showToast({ message, type: 'error' });
      throw error;
    }
  }, [canEdit, selectedIds, fetchCases, showToast]);

  // Export exactly the same filtered data currently shown in the workspace.
  const handleExport = useCallback(async (format: 'csv' | 'xlsx') => {
    if (exportingFormat) return;
    setExportingFormat(format);
    try {
      const params = new URLSearchParams({ format });
      if (selectedProjectId) params.set('projectId', selectedProjectId);
      if (selectedStageId) params.set('testStageId', selectedStageId);
      if (selectedBatchScopeId) params.set('batchScopeId', selectedBatchScopeId);
      if (selectedProgressCategory) params.set('progressCategory', selectedProgressCategory);
      if (selectedAssetSaved) params.set('assetSaved', selectedAssetSaved);
      if (search) params.set('search', search);
      if (resultSummary) params.set('resultSummary', resultSummary);
      if (assignee) params.set('assignee', assignee);
      if (rootCause) params.set('rootCause', rootCause);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/export?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = typeof data?.message === 'string'
          ? data.message
          : `导出失败 (${res.status})`;
        const code = typeof data?.error === 'string' ? data.error : 'EXPORT_FAILED';
        throw new ApiError(res.status, code, message);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `run-insight-${new Date().toISOString().slice(0, 10)}.${format}`;

      const url = URL.createObjectURL(blob);
      const anchor = exportAnchorRef.current ?? document.createElement('a');
      if (!exportAnchorRef.current) {
        exportAnchorRef.current = anchor;
        document.body.appendChild(anchor);
      }
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast({ message: `${filename} 已开始下载`, type: 'success' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '导出失败';
      showToast({ message, type: 'error' });
    } finally {
      setExportingFormat(null);
    }
  }, [
    exportingFormat,
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
    showToast,
  ]);

  if (!user) {
    return (
      <PageContainer title="工作台" subtitle="按项目、阶段和批跑筛选用例，推进分析闭环">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-text-secondary">请先登录以访问工作台</p>
        </div>
      </PageContainer>
    );
  }

  // Map CaseResultDTO to CaseRow for CaseTable
  const caseRows = cases.map((c) => ({
    id: c.id,
    caseNo: c.caseNo,
    name: c.name,
    resultSummary: c.resultSummary,
    logUrl: c.logUrl ?? '',
    projectId: c.projectId,
    testStageId: c.testStageId,
    batchScopeId: c.batchScopeId,
    assignee: c.assignee ?? undefined,
    progressCategory: c.progressCategory ?? undefined,
    rootCause: c.rootCause ?? undefined,
    mrOrTicket: c.mrOrTicket ?? undefined,
    assetSaved: c.assetSaved,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  return (
    <PageContainer
      title="工作台"
      subtitle="按项目、阶段和批跑筛选用例，推进分析闭环"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={exportingFormat !== null}
            onClick={() => handleExport('csv')}
          >
            {exportingFormat === 'csv' ? '导出中...' : '导出 CSV'}
          </Button>
          <Button
            disabled={exportingFormat !== null}
            onClick={() => handleExport('xlsx')}
          >
            {exportingFormat === 'xlsx' ? '导出中...' : '导出 Excel'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
      <FilterBar
        projects={projects}
        stages={stages}
        batches={batches}
        selectedProjectId={selectedProjectId}
        selectedStageId={selectedStageId}
        selectedBatchScopeId={selectedBatchScopeId}
        selectedProgressCategory={selectedProgressCategory}
        selectedAssetSaved={selectedAssetSaved}
        search={search}
        resultSummary={resultSummary}
        assignee={assignee}
        rootCause={rootCause}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onFilterChange={handleFilterChange}
      />

      {/* Metric cards */}
      {metrics && (
        <MetricCards
          metrics={{
            totalCaseCount: metrics.totalCaseCount,
            failedCaseCount: metrics.failedCaseCount,
            pendingCount: metrics.progressDistribution.find((d) => d.category === '待分析')?.count ?? 0,
            analyzedCount: metrics.analyzedCaseCount,
            assetCount: metrics.assetCount,
          }}
        />
      )}

      {/* Progress distribution */}
      {metrics && <ProgressDistribution data={metrics.progressDistribution} />}

      {/* Case table */}
      <CaseTable
        canEdit={canEdit}
        cases={caseRows}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortField={sortField}
        sortOrder={sortOrder}
        selectedIds={selectedIds}
        onPageChange={setPage}
        onSortChange={handleSortChange}
        onSaveAsset={handleSaveAsset}
        onViewDetail={handleViewDetail}
        onSelectionChange={handleSelectionChange}
        onClearSelection={handleClearSelection}
        onBatchAction={handleBatchAction}
      />

      {/* Save asset modal */}
      {canEdit && selectedCase && (
        <SaveAssetModal
          open={saveModalOpen}
          onClose={() => {
            setSaveModalOpen(false);
            setSelectedCase(null);
          }}
          onConfirm={handleSaveAssetConfirm}
        caseData={selectedCase}
      />
      )}

      {/* Batch action modal */}
      {canEdit && batchAction && (
        <BatchActionModal
          key={batchAction}
          open={batchAction !== null}
          action={batchAction}
          selectedCount={selectedIds.length}
          onClose={() => setBatchAction(null)}
          onConfirm={handleBatchConfirm}
        />
      )}
      </div>
    </PageContainer>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <PageContainer title="工作台" subtitle="按项目、阶段和批跑筛选用例，推进分析闭环">
          <div className="panel flex items-center justify-center p-10">
            <p className="text-sm text-text-secondary">加载中…</p>
          </div>
        </PageContainer>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
