'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import FilterBar from '@/components/workspace/FilterBar';
import MetricCards from '@/components/workspace/MetricCards';
import ProgressDistribution from '@/components/dashboard/ProgressDistribution';
import CaseTable from '@/components/workspace/CaseTable';
import { SaveAssetModal } from '@/components/shared/SaveAssetModal';
import { useAuth } from '@/components/shared/AuthProvider';
import { fetchJson } from '@/lib/fetch';
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
} from '@/types';

export default function WorkspacePage() {
  const { user } = useAuth();
  const router = useRouter();

  // Filter state
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; projectId: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; projectId: string; testStageId: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedBatchScopeId, setSelectedBatchScopeId] = useState('');

  // Cases state
  const [cases, setCases] = useState<CaseResultDTO[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Metrics state
  const [metrics, setMetrics] = useState<DashboardStatsResponse | null>(null);

  // Save asset modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseResultDTO | null>(null);

  // Fetch projects, stages, batches on mount
  useEffect(() => {
    async function fetchFilterData() {
      try {
        const data = await fetchJson<ProjectsResponse>('/api/projects');
        setProjects(data.projects.map((p: ProjectDTO) => ({ id: p.id, name: p.name })));
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
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const [casesData, statsData] = await Promise.all([
      fetchJson<CasesResponse>(`/api/cases?${params.toString()}`),
      fetchJson<DashboardStatsResponse>(`/api/stats/dashboard?${params.toString()}`),
    ]);

    return { casesData, statsData };
  }, [selectedProjectId, selectedStageId, selectedBatchScopeId, page]);

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

  // Filter change handler
  const handleFilterChange = useCallback(
    (filters: { projectId: string; stageId: string; batchScopeId: string }) => {
      setSelectedProjectId(filters.projectId);
      setSelectedStageId(filters.stageId);
      setSelectedBatchScopeId(filters.batchScopeId);
      setPage(1);
    },
    []
  );

  // Save asset handlers
  const handleSaveAsset = useCallback((caseId: string) => {
    const c = cases.find((item) => item.id === caseId);
    if (c) {
      setSelectedCase(c);
      setSaveModalOpen(true);
    }
  }, [cases]);

  const handleSaveAssetConfirm = useCallback(async (caseId: string) => {
    try {
      await fetchJson<SaveAssetResponse>(`/api/cases/${caseId}/save-asset`, { method: 'PATCH' });
      setSaveModalOpen(false);
      setSelectedCase(null);
      fetchCases();
    } catch (error) {
      console.error(error);
    }
  }, [fetchCases]);

  // View detail handler — navigate to case detail page
  const handleViewDetail = useCallback((id: string) => {
    router.push(`/case/${id}`);
  }, [router]);

  // Sort handler
  const handleSortChange = useCallback(
    (_sort: { field: string; order: 'asc' | 'desc' }) => {
      // Future: implement server-side sorting
    },
    []
  );

  if (!user) {
    return (
      <div className="flex items-center justify-center p-xl">
        <p className="text-sm text-[var(--color-text-secondary)]">请先登录以访问工作台</p>
      </div>
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
    <div className="space-y-6 p-xl">
      {/* Filter bar */}
      <FilterBar
        projects={projects}
        stages={stages}
        batches={batches}
        selectedProjectId={selectedProjectId}
        selectedStageId={selectedStageId}
        selectedBatchScopeId={selectedBatchScopeId}
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
        cases={caseRows}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onSortChange={handleSortChange}
        onSaveAsset={handleSaveAsset}
        onViewDetail={handleViewDetail}
      />

      {/* Save asset modal */}
      {selectedCase && (
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
    </div>
  );
}
