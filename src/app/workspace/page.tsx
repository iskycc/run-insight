'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FilterBar, { type WorkspaceFilters } from '@/components/workspace/FilterBar';
import MetricCards from '@/components/workspace/MetricCards';
import FailureQualityCard from '@/components/workspace/FailureQualityCard';
import SavedViewsCard from '@/components/workspace/SavedViewsCard';
import CaseTable, {
  type SortField,
  type SortOrder,
} from '@/components/workspace/CaseTable';
import { PageContainer } from '@/components/layout/PageContainer';
import { SaveAssetModal } from '@/components/shared/SaveAssetModal';
import {
  BatchActionModal,
  type BatchActionType,
  type BatchUpdates,
} from '@/components/shared/BatchActionModal';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { toDateInputValue } from '@/lib/date-time';
import { fetchJson, ApiError } from '@/lib/fetch';
import {
  CaretDown,
  DownloadSimple,
  HandWaving,
} from '@phosphor-icons/react';
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
  SavedViewDTO,
  SavedViewFilters,
  SavedViewScope,
  SavedViewsResponse,
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
  const pageSize = 5;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Metrics state
  const [metrics, setMetrics] = useState<DashboardStatsResponse | null>(null);

  // Saved views state
  const [savedViews, setSavedViews] = useState<SavedViewDTO[]>([]);
  const [savedViewsLoading, setSavedViewsLoading] = useState(false);
  const [savedViewSaving, setSavedViewSaving] = useState(false);
  const [canShareViews, setCanShareViews] = useState(false);
  const savedViewsRequestRef = useRef(0);
  const defaultViewAppliedRef = useRef(false);
  const hadInitialQueryRef = useRef(initialSearchParams.toString().length > 0);

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

  const handleApplySavedView = useCallback((filters: SavedViewFilters) => {
    handleFilterChange({
      projectId: filters.projectId ?? '',
      stageId: filters.stageId ?? '',
      batchScopeId: filters.batchScopeId ?? '',
      progressCategory: filters.progressCategory ?? '',
      assetSaved: filters.assetSaved ?? '',
      search: filters.search ?? '',
      resultSummary: filters.resultSummary ?? '',
      assignee: filters.assignee ?? '',
      rootCause: filters.rootCause ?? '',
      dateFrom: filters.dateFrom ?? '',
      dateTo: filters.dateTo ?? '',
    });
  }, [handleFilterChange]);

  const loadSavedViews = useCallback(async () => {
    const requestId = ++savedViewsRequestRef.current;
    setSavedViewsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.set('projectId', selectedProjectId);
      const query = params.toString();
      const data = await fetchJson<SavedViewsResponse>(
        `/api/saved-views${query ? `?${query}` : ''}`,
      );
      if (requestId !== savedViewsRequestRef.current) return;
      setSavedViews(data.views);
      setCanShareViews(data.canShare);

      if (!defaultViewAppliedRef.current) {
        defaultViewAppliedRef.current = true;
        if (!hadInitialQueryRef.current) {
          const defaultView = data.views.find(
            (view) => view.isDefault && view.isOwner,
          );
          if (defaultView) handleApplySavedView(defaultView.filters);
        }
      }
    } catch (error) {
      if (requestId !== savedViewsRequestRef.current) return;
      const message =
        error instanceof ApiError ? error.message : '加载保存视图失败';
      showToast({ message, type: 'error' });
      setSavedViews([]);
      setCanShareViews(false);
    } finally {
      if (requestId === savedViewsRequestRef.current) {
        setSavedViewsLoading(false);
      }
    }
  }, [handleApplySavedView, selectedProjectId, showToast]);

  useEffect(() => {
    if (!user) return;
    const timeout = window.setTimeout(() => {
      void loadSavedViews();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      savedViewsRequestRef.current += 1;
    };
  }, [loadSavedViews, user]);

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
      const filename = match?.[1] ?? `run-insight-${toDateInputValue()}.${format}`;

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
    projectName:
      c.projectName ??
      projects.find((project) => project.id === c.projectId)?.name,
    testStageId: c.testStageId,
    testStageName:
      c.testStageName ??
      stages.find((stage) => stage.id === c.testStageId)?.name,
    batchScopeId: c.batchScopeId,
    assignee: c.assignee ?? undefined,
    progressCategory: c.progressCategory ?? undefined,
    rootCause: c.rootCause ?? undefined,
    mrOrTicket: c.mrOrTicket ?? undefined,
    assetSaved: c.assetSaved,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  const pendingCount =
    metrics?.progressDistribution.find((item) => item.category === '待分析')?.count ?? 0;
  const now = new Date();
  const greeting =
    now.getHours() < 12 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好';
  const greetingTime = [
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  ].join(' ');

  const applyQuickView = (patch: Partial<WorkspaceFilters>) => {
    handleFilterChange({
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

  const currentSavedFilters: SavedViewFilters = {
    ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
    ...(selectedStageId ? { stageId: selectedStageId } : {}),
    ...(selectedBatchScopeId ? { batchScopeId: selectedBatchScopeId } : {}),
    ...(selectedProgressCategory
      ? { progressCategory: selectedProgressCategory }
      : {}),
    ...(selectedAssetSaved ? { assetSaved: selectedAssetSaved } : {}),
    ...(search ? { search } : {}),
    ...(resultSummary ? { resultSummary } : {}),
    ...(assignee ? { assignee } : {}),
    ...(rootCause ? { rootCause } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

  const createSavedView = async (input: {
    name: string;
    scope: SavedViewScope;
    isDefault: boolean;
  }) => {
    if (input.scope === 'PROJECT' && !selectedProjectId) {
      showToast({ message: '请先选择要共享视图的项目', type: 'error' });
      return false;
    }
    setSavedViewSaving(true);
    try {
      await fetchJson('/api/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          filters: currentSavedFilters,
          projectId: input.scope === 'PROJECT' ? selectedProjectId : undefined,
        }),
      });
      showToast({ message: '视图已保存', type: 'success' });
      await loadSavedViews();
      return true;
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : '保存视图失败';
      showToast({ message, type: 'error' });
      return false;
    } finally {
      setSavedViewSaving(false);
    }
  };

  const updateSavedView = async (id: string) => {
    setSavedViewSaving(true);
    try {
      await fetchJson(`/api/saved-views/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: currentSavedFilters }),
      });
      showToast({ message: '视图已更新为当前筛选', type: 'success' });
      await loadSavedViews();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : '更新视图失败';
      showToast({ message, type: 'error' });
    } finally {
      setSavedViewSaving(false);
    }
  };

  const setDefaultSavedView = async (id: string) => {
    setSavedViewSaving(true);
    try {
      await fetchJson(`/api/saved-views/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      showToast({ message: '默认视图已更新', type: 'success' });
      await loadSavedViews();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : '设置默认视图失败';
      showToast({ message, type: 'error' });
    } finally {
      setSavedViewSaving(false);
    }
  };

  const deleteSavedView = async (id: string) => {
    const view = savedViews.find((item) => item.id === id);
    if (!view || !window.confirm(`确定删除视图“${view.name}”吗？`)) return;
    setSavedViewSaving(true);
    try {
      await fetchJson<{ deleted: boolean }>(`/api/saved-views/${id}`, {
        method: 'DELETE',
      });
      showToast({ message: '视图已删除', type: 'success' });
      await loadSavedViews();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : '删除视图失败';
      showToast({ message, type: 'error' });
    } finally {
      setSavedViewSaving(false);
    }
  };

  return (
    <PageContainer
      title="工作台"
      subtitle={
        metrics
          ? (
            <span className="inline-flex items-center gap-1.5">
              <HandWaving size={16} weight="fill" className="text-warning" aria-hidden="true" />
              {greeting}，{user.username}！截至 {greetingTime}，共{' '}
              {metrics.totalCaseCount.toLocaleString()} 条用例，
              {metrics.analyzedCaseCount.toLocaleString()} 条已分析。
            </span>
          )
          : '按项目、阶段和批跑筛选用例，推进分析闭环'
      }
      actions={
        <details className="group relative">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] border border-border bg-surface-solid px-4 text-sm font-medium text-text-primary shadow-[0_4px_14px_rgba(38,57,88,0.045)] transition hover:border-accent/30 [&::-webkit-details-marker]:hidden">
            <DownloadSimple size={17} aria-hidden="true" />
            导出数据
            <CaretDown size={13} weight="bold" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-[14px] border border-border/90 bg-surface-solid p-1.5 shadow-[0_18px_50px_rgba(38,57,88,0.14)]">
            <button
              type="button"
              disabled={exportingFormat !== null}
              onClick={() => handleExport('xlsx')}
              className="flex h-9 w-full items-center gap-2 rounded-[9px] px-3 text-left text-xs font-medium text-text-primary transition hover:bg-accent/5 disabled:opacity-50"
            >
              <DownloadSimple size={15} aria-hidden="true" />
              {exportingFormat === 'xlsx' ? '导出中…' : 'Excel 工作簿'}
            </button>
            <button
              type="button"
              disabled={exportingFormat !== null}
              onClick={() => handleExport('csv')}
              className="flex h-9 w-full items-center gap-2 rounded-[9px] px-3 text-left text-xs font-medium text-text-primary transition hover:bg-accent/5 disabled:opacity-50"
            >
              <DownloadSimple size={15} aria-hidden="true" />
              {exportingFormat === 'csv' ? '导出中…' : 'CSV 文件'}
            </button>
          </div>
        </details>
      }
    >
      <div className="space-y-5">
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

        {metrics && (
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(270px,0.92fr)_minmax(430px,1.3fr)_minmax(260px,0.86fr)]">
            <MetricCards
              metrics={{
                totalCaseCount: metrics.totalCaseCount,
                failedCaseCount: metrics.failedCaseCount,
                pendingCount,
                analyzedCount: metrics.analyzedCaseCount,
                assetCount: metrics.assetCount,
              }}
              onContinue={() => applyQuickView({ progressCategory: 'PENDING' })}
            />
            <FailureQualityCard
              failureCount={metrics.failedCaseCount}
              totalCaseCount={metrics.totalCaseCount}
              data={metrics.progressDistribution}
            />
            <SavedViewsCard
              views={savedViews}
              loading={savedViewsLoading}
              saving={savedViewSaving}
              canShare={canShareViews}
              currentProjectId={selectedProjectId}
              onSelect={handleApplySavedView}
              onQuickFilter={applyQuickView}
              onCreate={createSavedView}
              onUpdate={updateSavedView}
              onSetDefault={setDefaultSavedView}
              onDelete={deleteSavedView}
            />
          </div>
        )}

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
