'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { AssetList, type AssetItem } from '@/components/assets/AssetList';
import { AssetDetail } from '@/components/assets/AssetDetail';
import { Select } from '@/components/shared/Select';
import { Input } from '@/components/shared/Input';
import { useAuth } from '@/components/shared/AuthProvider';
import { PROGRESS_CATEGORIES, PROGRESS_LABELS, type ProgressCategory } from '@/types';

type ProjectOption = { id: string; name: string };
type StageOption = { id: string; name: string; projectId: string };
type BatchOption = { id: string; name: string; testStageId: string };

export default function AssetsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // 筛选状态
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedProgress, setSelectedProgress] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [rootCauseFilter, setRootCauseFilter] = useState('');

  // 数据状态
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null);

  const resetPageForFilterChange = () => {
    setLoading(true);
    setPage(1);
  };

  // 加载项目列表
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects?.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) ?? []);
        }
      } catch { /* 静默 */ }
    }
    if (user) loadProjects();
  }, [user]);

  // 级联：项目 → 阶段
  useEffect(() => {
    async function loadStages() {
      setSelectedStage('');
      setBatches([]);
      setSelectedBatch('');
      if (!selectedProject) { setStages([]); return; }
      try {
        const res = await fetch(`/api/projects/${selectedProject}/stages`);
        if (res.ok) {
          const data = await res.json();
          setStages(data.stages?.map((s: { id: string; name: string; projectId: string }) => ({ id: s.id, name: s.name, projectId: s.projectId })) ?? []);
        }
      } catch { /* 静默 */ }
    }
    loadStages();
  }, [selectedProject]);

  // 级联：阶段 → 批跑
  useEffect(() => {
    async function loadBatches() {
      setSelectedBatch('');
      if (!selectedStage) { setBatches([]); return; }
      try {
        const res = await fetch(`/api/stages/${selectedStage}/batches`);
        if (res.ok) {
          const data = await res.json();
          setBatches(data.batches?.map((b: { id: string; name: string; testStageId: string }) => ({ id: b.id, name: b.name, testStageId: b.testStageId })) ?? []);
        }
      } catch { /* 静默 */ }
    }
    loadBatches();
  }, [selectedStage]);

  useEffect(() => {
    if (!user) return;

    let isActive = true;

    async function loadAssets() {
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (selectedProject) params.set('projectId', selectedProject);
        if (selectedStage) params.set('testStageId', selectedStage);
        if (selectedBatch) params.set('batchScopeId', selectedBatch);
        if (selectedProgress) params.set('progressCategory', selectedProgress);
        if (assigneeFilter) params.set('assignee', assigneeFilter);
        if (rootCauseFilter) params.set('rootCause', rootCauseFilter);

        const res = await fetch(`/api/assets?${params}`);
        if (!isActive) return;

        if (res.ok) {
          const data = await res.json();
          setAssets(data.assets ?? []);
          setTotal(data.total ?? 0);
        }
      } catch { /* 静默 */ } finally {
        if (isActive) setLoading(false);
      }
    }

    loadAssets();

    return () => {
      isActive = false;
    };
  }, [user, page, selectedProject, selectedStage, selectedBatch, selectedProgress, assigneeFilter, rootCauseFilter]);

  // 未登录重定向
  useEffect(() => {
    if (!authLoading && !user) router.push('/');
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <PageContainer title="资产库">
        <div className="flex items-center justify-center py-2xl">
          <div className="text-text-secondary text-sm">加载中…</div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="资产库" subtitle="已保存的分析资产">
      {/* 筛选栏 */}
      <div className="panel mb-6 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="项目"
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            value={selectedProject}
            onChange={(e) => {
              resetPageForFilterChange();
              setSelectedProject(e.target.value);
            }}
            placeholder="全部项目"
          />
          <Select
            label="测试阶段"
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            value={selectedStage}
            onChange={(e) => {
              resetPageForFilterChange();
              setSelectedStage(e.target.value);
            }}
            placeholder="全部阶段"
          />
          <Select
            label="批跑范围"
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
            value={selectedBatch}
            onChange={(e) => {
              resetPageForFilterChange();
              setSelectedBatch(e.target.value);
            }}
            placeholder="全部批跑"
          />
          <Select
            label="进展分类"
            options={PROGRESS_CATEGORIES.map((cat) => ({ value: cat, label: PROGRESS_LABELS[cat] }))}
            value={selectedProgress}
            onChange={(e) => {
              resetPageForFilterChange();
              setSelectedProgress(e.target.value as ProgressCategory);
            }}
            placeholder="全部分类"
          />
          <Input
            label="责任人"
            value={assigneeFilter}
            onChange={(e) => {
              resetPageForFilterChange();
              setAssigneeFilter(e.target.value);
            }}
            placeholder="按责任人筛选"
          />
          <Input
            label="问题根因"
            value={rootCauseFilter}
            onChange={(e) => {
              resetPageForFilterChange();
              setRootCauseFilter(e.target.value);
            }}
            placeholder="按根因关键词筛选"
          />
        </div>
      </div>

      {/* 资产详情 or 列表 */}
      {selectedAsset ? (
        <AssetDetail asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      ) : (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-2xl">
              <div className="text-text-secondary text-sm">加载中…</div>
            </div>
          ) : (
            <AssetList
              assets={assets}
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={(nextPage) => {
                setLoading(true);
                setPage(nextPage);
              }}
              onSelect={(id) => {
                const asset = assets.find((a) => a.id === id);
                if (asset) setSelectedAsset(asset);
              }}
            />
          )}
        </>
      )}

      {/* 统计 */}
      <div className="mt-md text-xs text-text-secondary">
        共 {total} 条资产
      </div>
    </PageContainer>
  );
}
