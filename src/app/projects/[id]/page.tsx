'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { LoadingState } from '@/components/shared/LoadingState';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import {
  dateTimeLocalToISOString,
  formatDate,
  formatDateTime,
  toDateTimeLocalValue,
} from '@/lib/date-time';
import { ApiError, fetchJson } from '@/lib/fetch';
import { ArrowLeft, CaretDown, DotsThree, Plus } from '@phosphor-icons/react';
import type {
  BatchScopeDTO,
  BatchScopeWithStats,
  BatchesResponse,
  ProjectWithStats,
  ProjectsResponse,
  StagesResponse,
  TestStageDTO,
  TestStageWithStats,
} from '@/types';

type BatchState = {
  batches: BatchScopeWithStats[];
  loading: boolean;
  loaded: boolean;
};

type BatchMetadataForm = {
  executedAt: string;
  startedAt: string;
  finishedAt: string;
  environment: string;
  buildVersion: string;
  commitSha: string;
  pipelineUrl: string;
};

function emptyBatchMetadata(): BatchMetadataForm {
  return {
    executedAt: toDateTimeLocalValue(),
    startedAt: '',
    finishedAt: '',
    environment: '',
    buildVersion: '',
    commitSha: '',
    pipelineUrl: '',
  };
}

function serializeBatchMetadata(metadata: BatchMetadataForm): {
  data: {
    executedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    environment: string | null;
    buildVersion: string | null;
    commitSha: string | null;
    pipelineUrl: string | null;
  } | null;
  error: string | null;
} {
  if (!metadata.executedAt) {
    return { data: null, error: '执行时间不能为空' };
  }
  const executedAt = dateTimeLocalToISOString(metadata.executedAt);
  const startedAt = metadata.startedAt
    ? dateTimeLocalToISOString(metadata.startedAt)
    : null;
  const finishedAt = metadata.finishedAt
    ? dateTimeLocalToISOString(metadata.finishedAt)
    : null;
  if (!executedAt || (metadata.startedAt && !startedAt) || (metadata.finishedAt && !finishedAt)) {
    return { data: null, error: '执行时间格式不正确' };
  }
  if (startedAt && finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) {
    return { data: null, error: '结束时间不能早于开始时间' };
  }
  return {
    data: {
      executedAt,
      startedAt,
      finishedAt,
      environment: metadata.environment.trim() || null,
      buildVersion: metadata.buildVersion.trim() || null,
      commitSha: metadata.commitSha.trim() || null,
      pipelineUrl: metadata.pipelineUrl.trim() || null,
    },
    error: null,
  };
}

function rate(part: number, total: number) {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '—';
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [project, setProject] = useState<ProjectWithStats | null>(null);
  const [stages, setStages] = useState<TestStageWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [batchStates, setBatchStates] = useState<Record<string, BatchState>>({});

  const [createStageOpen, setCreateStageOpen] = useState(false);
  const [stageName, setStageName] = useState('');
  const [stageError, setStageError] = useState('');
  const [creatingStage, setCreatingStage] = useState(false);

  const [batchStage, setBatchStage] = useState<TestStageWithStats | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchMetadata, setBatchMetadata] = useState<BatchMetadataForm>(emptyBatchMetadata);
  const [editingBatch, setEditingBatch] = useState<BatchScopeWithStats | null>(null);
  const [batchError, setBatchError] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);

  const canEdit = project?.canEdit ?? false;
  const canDelete = project?.canAdmin ?? false;

  useEffect(() => {
    if (!user || !id) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const [projectsData, stagesData] = await Promise.all([
          fetchJson<ProjectsResponse>('/api/projects?includeArchived=true', {
            signal: controller.signal,
          }),
          fetchJson<StagesResponse>(
            `/api/projects/${id}/stages?includeArchived=${showArchived}`,
            { signal: controller.signal }
          ),
        ]);
        if (controller.signal.aborted) return;
        const currentProject = projectsData.projects.find((item) => item.id === id);
        if (!currentProject) {
          setNotFound(true);
          setProject(null);
          setStages([]);
          return;
        }
        setNotFound(false);
        setProject(currentProject);
        setStages(stagesData.stages);
      } catch (error) {
        if (controller.signal.aborted) return;
        showToast({
          message: error instanceof ApiError ? error.message : '加载项目失败',
          type: 'error',
        });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [id, reloadKey, showArchived, showToast, user]);

  const loadBatches = useCallback(
    async (stageId: string, force = false) => {
      if (!force && batchStates[stageId]?.loaded) return;
      setBatchStates((current) => ({
        ...current,
        [stageId]: {
          batches: current[stageId]?.batches ?? [],
          loading: true,
          loaded: false,
        },
      }));
      try {
        const data = await fetchJson<BatchesResponse>(
          `/api/stages/${stageId}/batches?includeArchived=${showArchived}`
        );
        setBatchStates((current) => ({
          ...current,
          [stageId]: { batches: data.batches, loading: false, loaded: true },
        }));
      } catch (error) {
        setBatchStates((current) => ({
          ...current,
          [stageId]: {
            batches: current[stageId]?.batches ?? [],
            loading: false,
            loaded: false,
          },
        }));
        showToast({
          message: error instanceof ApiError ? error.message : '加载批跑失败',
          type: 'error',
        });
      }
    },
    [batchStates, showArchived, showToast]
  );

  const toggleStage = useCallback(
    (stageId: string) => {
      if (expandedStageId === stageId) {
        setExpandedStageId(null);
        return;
      }
      setExpandedStageId(stageId);
      void loadBatches(stageId);
    },
    [expandedStageId, loadBatches]
  );

  const createStage = useCallback(async () => {
    const name = stageName.trim();
    if (!name) {
      setStageError('阶段名称为必填');
      return;
    }
    setCreatingStage(true);
    setStageError('');
    try {
      await fetchJson<{ stage: TestStageDTO }>(`/api/projects/${id}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setCreateStageOpen(false);
      setStageName('');
      showToast({ message: '阶段创建成功', type: 'success' });
      setReloadKey((value) => value + 1);
    } catch (error) {
      setStageError(error instanceof ApiError ? error.message : '创建阶段失败');
    } finally {
      setCreatingStage(false);
    }
  }, [id, showToast, stageName]);

  const createBatch = useCallback(async () => {
    const name = batchName.trim();
    if (!batchStage || !name) {
      setBatchError('批跑名称为必填');
      return;
    }
    const serialized = serializeBatchMetadata(batchMetadata);
    if (!serialized.data) {
      setBatchError(serialized.error ?? '批跑执行信息格式不正确');
      return;
    }
    setCreatingBatch(true);
    setBatchError('');
    try {
      await fetchJson<{ batch: BatchScopeDTO }>(
        `/api/stages/${batchStage.id}/batches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            ...serialized.data,
          }),
        }
      );
      const stageId = batchStage.id;
      setBatchStage(null);
      setBatchName('');
      setBatchMetadata(emptyBatchMetadata());
      showToast({ message: '批跑创建成功', type: 'success' });
      await loadBatches(stageId, true);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setBatchError(error instanceof ApiError ? error.message : '创建批跑失败');
    } finally {
      setCreatingBatch(false);
    }
  }, [batchMetadata, batchName, batchStage, loadBatches, showToast]);

  const editBatch = useCallback(async () => {
    const name = batchName.trim();
    if (!editingBatch || !name) {
      setBatchError('批跑名称为必填');
      return;
    }
    const serialized = serializeBatchMetadata(batchMetadata);
    if (!serialized.data) {
      setBatchError(serialized.error ?? '批跑执行信息格式不正确');
      return;
    }
    setCreatingBatch(true);
    setBatchError('');
    try {
      await fetchJson(`/api/batches/${editingBatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ...serialized.data,
        }),
      });
      const stageId = editingBatch.testStageId;
      setEditingBatch(null);
      setBatchName('');
      setBatchMetadata(emptyBatchMetadata());
      showToast({ message: '批跑信息已更新', type: 'success' });
      await loadBatches(stageId, true);
    } catch (error) {
      setBatchError(error instanceof ApiError ? error.message : '更新批跑失败');
    } finally {
      setCreatingBatch(false);
    }
  }, [batchMetadata, batchName, editingBatch, loadBatches, showToast]);

  const restoreItem = useCallback(
    async (kind: 'stage' | 'batch', item: TestStageWithStats | BatchScopeWithStats) => {
      const label = kind === 'stage' ? '阶段' : '批跑';
      try {
        await fetchJson(`/api/${kind === 'stage' ? 'stages' : 'batches'}/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: false }),
        });
        showToast({ message: `${label}已恢复`, type: 'success' });
        if (kind === 'batch') {
          await loadBatches((item as BatchScopeWithStats).testStageId, true);
        }
        setReloadKey((value) => value + 1);
      } catch (error) {
        showToast({
          message: error instanceof ApiError ? error.message : `${label}操作失败`,
          type: 'error',
        });
      }
    },
    [loadBatches, showToast]
  );

  const moveToTrash = useCallback(
    async (kind: 'stage' | 'batch', item: TestStageWithStats | BatchScopeWithStats) => {
      const label = kind === 'stage' ? '阶段' : '批跑';
      if (!window.confirm(`确定将${label}“${item.name}”移至回收站吗？之后可以恢复。`)) {
        return;
      }
      try {
        await fetchJson(`/api/${kind === 'stage' ? 'stages' : 'batches'}/${item.id}`, {
          method: 'DELETE',
        });
        showToast({ message: `${label}已移至回收站`, type: 'success' });
        if (kind === 'batch') {
          await loadBatches((item as BatchScopeWithStats).testStageId, true);
        } else if (expandedStageId === item.id) {
          setExpandedStageId(null);
        }
        setReloadKey((value) => value + 1);
      } catch (error) {
        showToast({
          message: error instanceof ApiError ? error.message : `删除${label}失败`,
          type: 'error',
        });
      }
    },
    [expandedStageId, loadBatches, showToast]
  );

  const permanentlyDeleteItem = useCallback(
    async (kind: 'stage' | 'batch', item: TestStageWithStats | BatchScopeWithStats) => {
      const label = kind === 'stage' ? '阶段' : '批跑';
      const cascadeDescription = kind === 'stage'
        ? '其批跑、用例及关联数据也会被级联删除'
        : '其用例及关联数据也会被级联删除';
      if (
        !window.confirm(
          `永久删除${label}“${item.name}”后无法恢复，${cascadeDescription}。确定继续吗？`
        )
      ) {
        return;
      }
      const confirmation = window.prompt(`请输入${label}名称“${item.name}”以确认永久删除：`);
      if (confirmation !== item.name) {
        if (confirmation !== null) {
          showToast({ message: '名称不匹配，已取消永久删除', type: 'error' });
        }
        return;
      }
      try {
        await fetchJson(
          `/api/${kind === 'stage' ? 'stages' : 'batches'}/${item.id}?permanent=true`,
          { method: 'DELETE' }
        );
        showToast({ message: `${label}已永久删除`, type: 'success' });
        if (kind === 'batch') {
          await loadBatches((item as BatchScopeWithStats).testStageId, true);
        } else if (expandedStageId === item.id) {
          setExpandedStageId(null);
        }
        setReloadKey((value) => value + 1);
      } catch (error) {
        showToast({
          message: error instanceof ApiError ? error.message : `永久删除${label}失败`,
          type: 'error',
        });
      }
    },
    [expandedStageId, loadBatches, showToast]
  );

  if (authLoading) {
    return (
      <PageContainer title="项目详情">
        <LoadingState label="正在加载项目详情" rows={5} />
      </PageContainer>
    );
  }

  if (!user) {
    return (
      <PageContainer title="项目详情" subtitle="查看阶段与批跑">
        <div className="panel p-10 text-center text-sm text-text-secondary">
          请先登录以访问项目详情
        </div>
      </PageContainer>
    );
  }

  if (!loading && notFound) {
    return (
      <PageContainer title="项目不存在">
        <div className="panel p-10 text-center">
          <p className="text-sm text-text-secondary">该项目不存在或已被永久删除</p>
          <Link href="/projects" className="mt-4 inline-block text-sm text-accent">
            返回项目列表
          </Link>
        </div>
      </PageContainer>
    );
  }

  const title = project?.name ?? '项目详情';
  const projectInactive = project?.archived ?? false;

  return (
    <PageContainer
      title={title}
      subtitle={project ? `创建于 ${formatDate(project.createdAt)}` : '加载项目信息'}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/projects"
            className="rounded-xl px-3 py-2 text-sm text-text-secondary transition hover:bg-bg hover:text-accent"
          >
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft size={15} aria-hidden="true" />
              项目列表
            </span>
          </Link>
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center rounded-xl border border-border bg-bg px-3 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:bg-surface-solid focus:outline-none focus:ring-2 focus:ring-accent/30 [&::-webkit-details-marker]:hidden">
              项目管理
              <CaretDown size={14} aria-hidden="true" className="ml-2 text-text-secondary" />
            </summary>
            <div className="absolute right-0 top-12 z-30 w-40 overflow-hidden rounded-xl border border-border bg-surface-solid p-1.5 shadow-lg">
              {[
                ['项目设置', `/projects/${id}/settings`],
                ['项目成员', `/projects/${id}/members`],
                ['根因分类', `/projects/${id}/root-causes`],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="block rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-bg"
                >
                  {label}
                </Link>
              ))}
            </div>
          </details>
          {canEdit && !projectInactive && (
            <Button onClick={() => setCreateStageOpen(true)} className="rounded-xl">
              <Plus size={16} aria-hidden="true" />
              新建阶段
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {projectInactive && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-primary">
            此项目位于回收站。请先在项目列表中恢复项目，再继续创建或管理阶段与批跑。
          </div>
        )}

        <section aria-label="项目概览" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="panel col-span-2 overflow-hidden p-5 lg:col-span-2">
            <p className="text-xs font-semibold text-text-secondary">整体通过率</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-4xl font-semibold tracking-tight text-text-primary">
                {rate(project?.passCount ?? 0, project?.caseCount ?? 0)}
              </p>
              <Badge progress="fixed">{project?.archived ? '回收站' : '运行中'}</Badge>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-border/70">
              <div
                className="h-full rounded-full bg-success"
                style={{
                  width: rate(project?.passCount ?? 0, project?.caseCount ?? 0) === '—'
                    ? '0%'
                    : rate(project?.passCount ?? 0, project?.caseCount ?? 0),
                }}
              />
            </div>
          </div>
          {[
            ['阶段', project?.stageCount ?? 0],
            ['用例', project?.caseCount ?? 0],
            ['通过', project?.passCount ?? 0],
            ['失败', project?.failCount ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="panel min-w-0 p-4 lg:col-span-1">
              <p className="text-xs font-semibold text-text-secondary">{label}</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-text-primary">{value}</p>
            </div>
          ))}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">阶段与批跑</h2>
              <p className="mt-1 text-sm text-text-secondary">
                展开阶段查看并管理其批跑范围
              </p>
            </div>
            <div
              className="inline-flex rounded-xl border border-border bg-bg p-1"
              role="group"
              aria-label="阶段与批跑筛选"
            >
              {([
                [false, '活跃内容'],
                [true, '含回收站'],
              ] as const).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={showArchived === value}
                  onClick={() => {
                    setShowArchived(value);
                    setExpandedStageId(null);
                    setBatchStates({});
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    showArchived === value
                      ? 'bg-surface-solid text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="panel overflow-hidden">
            {loading ? (
              <LoadingState label="正在加载测试阶段" rows={4} className="m-4" />
            ) : stages.length === 0 ? (
              <EmptyState
                title="暂无阶段"
                description={canEdit && !projectInactive ? '创建阶段后即可添加批跑' : '当前没有可查看的阶段'}
                actionLabel={canEdit && !projectInactive ? '新建阶段' : undefined}
                onAction={canEdit && !projectInactive ? () => setCreateStageOpen(true) : undefined}
              />
            ) : (
              <div className="divide-y divide-border">
                {stages.map((stage) => {
                  const expanded = expandedStageId === stage.id;
                  const batchState = batchStates[stage.id];
                  return (
                    <article key={stage.id}>
                      <div className="flex flex-wrap items-stretch gap-3 px-3 py-3 transition hover:bg-bg/40 sm:px-4">
                        <button
                          type="button"
                          onClick={() => toggleStage(stage.id)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? '收起' : '展开'}${stage.name}`}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-lg text-text-secondary transition ${expanded ? 'rotate-90 text-accent' : ''}`}
                          >
                            ›
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-semibold text-text-primary">{stage.name}</span>
                              <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                                {stage.batchCount} 个批跑
                              </span>
                              {stage.archived && <Badge progress="blocked">回收站</Badge>}
                            </span>
                            <span className="mt-1.5 block text-xs text-text-secondary">
                              {stage.caseCount} 个用例 ·
                              <span className="ml-1 text-success">{stage.passCount} 通过</span>
                              <span className="ml-1 text-danger">{stage.failCount} 失败</span>
                            </span>
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-2 self-center">
                          {canEdit && !projectInactive && !stage.archived && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="rounded-xl"
                              aria-label="新建批跑"
                              onClick={() => {
                                setBatchStage(stage);
                                setBatchName('');
                                setBatchMetadata(emptyBatchMetadata());
                                setBatchError('');
                              }}
                            >
                              <Plus size={15} aria-hidden="true" />
                              批跑
                            </Button>
                          )}
                          {(canEdit || canDelete) && !projectInactive && (
                            <details className="relative">
                              <summary
                                aria-label={`管理阶段 ${stage.name}`}
                                className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-text-secondary hover:bg-surface-solid hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 [&::-webkit-details-marker]:hidden"
                              >
                                <DotsThree size={20} weight="bold" aria-hidden="true" />
                              </summary>
                              <div className="absolute right-0 top-10 z-20 w-36 overflow-hidden rounded-xl border border-border bg-surface-solid p-1.5 shadow-lg">
                                {canEdit && !stage.archived && (
                                  <button
                                    type="button"
                                    onClick={() => void moveToTrash('stage', stage)}
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg"
                                  >
                                    移至回收站
                                  </button>
                                )}
                                {canEdit && stage.archived && (
                                  <button
                                    type="button"
                                    onClick={() => void restoreItem('stage', stage)}
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg"
                                  >
                                    恢复阶段
                                  </button>
                                )}
                                {canDelete && stage.archived && (
                                  <button
                                    type="button"
                                    onClick={() => void permanentlyDeleteItem('stage', stage)}
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                                  >
                                    永久删除
                                  </button>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>

                      {expanded && (
                        <div className="border-t border-border bg-bg/35 px-4 py-4 sm:pl-16">
                          {batchState?.loading ? (
                            <LoadingState compact label="正在加载批跑…" />
                          ) : !batchState?.loaded ? (
                            <Button size="sm" variant="secondary" onClick={() => loadBatches(stage.id, true)}>
                              重新加载批跑
                            </Button>
                          ) : batchState.batches.length === 0 ? (
                            <p className="text-sm text-text-secondary">该阶段暂无批跑</p>
                          ) : (
                            <div className="space-y-2">
                              {batchState.batches.map((batch) => (
                                <div
                                  key={batch.id}
                                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3 shadow-sm"
                                >
                                  <div className="min-w-[10rem] flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-text-primary">{batch.name}</span>
                                      {batch.archived && <Badge progress="blocked">回收站</Badge>}
                                    </div>
                                    <p className="mt-1 text-xs text-text-secondary">
                                      {batch.caseCount} 个用例 ·
                                      <span className="ml-1 text-success">{batch.passCount} 通过</span>
                                      <span className="ml-1 text-danger">{batch.failCount} 失败</span>
                                    </p>
                                    <p className="mt-1 text-xs text-text-secondary">
                                      {formatDateTime(batch.executedAt)}
                                      {batch.environment ? ` · ${batch.environment}` : ''}
                                      {batch.buildVersion ? ` · ${batch.buildVersion}` : ''}
                                    </p>
                                    {(batch.startedAt || batch.finishedAt) && (
                                      <p className="mt-1 text-xs text-text-secondary">
                                        {batch.startedAt
                                          ? `开始 ${formatDateTime(batch.startedAt)}`
                                          : '未记录开始时间'}
                                        {' · '}
                                        {batch.finishedAt
                                          ? `结束 ${formatDateTime(batch.finishedAt)}`
                                          : '进行中'}
                                      </p>
                                    )}
                                    {(batch.commitSha || batch.pipelineUrl) && (
                                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                        {batch.commitSha && (
                                          <code
                                            className="rounded-md bg-bg px-2 py-1 text-text-secondary"
                                            title={`Commit ${batch.commitSha}`}
                                          >
                                            {batch.commitSha.slice(0, 12)}
                                          </code>
                                        )}
                                        {batch.pipelineUrl && (
                                          <a
                                            href={batch.pipelineUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-accent hover:underline"
                                            aria-label={`打开 ${batch.name} 的流水线链接（新窗口）`}
                                          >
                                            查看流水线 ↗
                                          </a>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <Link
                                    href={`/projects/${id}/batches/${batch.id}`}
                                    className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/15"
                                  >
                                    查看结果
                                  </Link>
                                  {(canEdit || canDelete) && !projectInactive && (
                                    <details className="relative">
                                      <summary
                                        aria-label={`管理批跑 ${batch.name}`}
                                        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-text-secondary hover:bg-bg hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 [&::-webkit-details-marker]:hidden"
                                      >
                                        <DotsThree size={20} weight="bold" aria-hidden="true" />
                                      </summary>
                                      <div className="absolute right-0 top-10 z-20 w-36 overflow-hidden rounded-xl border border-border bg-surface-solid p-1.5 shadow-lg">
                                        {canEdit && !batch.archived && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingBatch(batch);
                                              setBatchName(batch.name);
                                              setBatchMetadata({
                                                executedAt: toDateTimeLocalValue(batch.executedAt),
                                                startedAt: batch.startedAt
                                                  ? toDateTimeLocalValue(batch.startedAt)
                                                  : '',
                                                finishedAt: batch.finishedAt
                                                  ? toDateTimeLocalValue(batch.finishedAt)
                                                  : '',
                                                environment: batch.environment ?? '',
                                                buildVersion: batch.buildVersion ?? '',
                                                commitSha: batch.commitSha ?? '',
                                                pipelineUrl: batch.pipelineUrl ?? '',
                                              });
                                              setBatchError('');
                                            }}
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg"
                                          >
                                            编辑信息
                                          </button>
                                        )}
                                        {canEdit && !batch.archived && (
                                          <button
                                            type="button"
                                            onClick={() => void moveToTrash('batch', batch)}
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg"
                                          >
                                            移至回收站
                                          </button>
                                        )}
                                        {canEdit && batch.archived && (
                                          <button
                                            type="button"
                                            onClick={() => void restoreItem('batch', batch)}
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg"
                                          >
                                            恢复批跑
                                          </button>
                                        )}
                                        {canDelete && batch.archived && (
                                          <button
                                            type="button"
                                            onClick={() => void permanentlyDeleteItem('batch', batch)}
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                                          >
                                            永久删除
                                          </button>
                                        )}
                                      </div>
                                    </details>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={createStageOpen}
        onClose={() => {
          setCreateStageOpen(false);
          setStageName('');
          setStageError('');
        }}
        title="新建阶段"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateStageOpen(false)}>
              取消
            </Button>
            <Button onClick={createStage} loading={creatingStage} loadingLabel="创建中…">
              创建阶段
            </Button>
          </>
        }
      >
        <Input
          label="阶段名称"
          value={stageName}
          onChange={(event) => setStageName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void createStage();
          }}
          error={stageError}
          placeholder="例如：SIT 第一阶段"
        />
      </Modal>

      <Modal
        open={!!batchStage}
        onClose={() => {
          setBatchStage(null);
          setBatchName('');
          setBatchMetadata(emptyBatchMetadata());
          setBatchError('');
        }}
        title={`新建批跑${batchStage ? ` · ${batchStage.name}` : ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBatchStage(null)}>
              取消
            </Button>
            <Button onClick={createBatch} loading={creatingBatch} loadingLabel="创建中…">
              创建批跑
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="批跑名称"
            value={batchName}
            onChange={(event) => setBatchName(event.target.value)}
            error={batchError}
            placeholder="例如：2026-07-25 回归"
          />
          <Input
            label="执行时间"
            type="datetime-local"
            required
            value={batchMetadata.executedAt}
            onChange={(event) => setBatchMetadata((value) => ({ ...value, executedAt: event.target.value }))}
          />
          <p className="-mt-2 text-xs text-text-secondary">
            按当前设备时区填写，保存后统一转换为标准时间。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="开始时间（可选）"
              type="datetime-local"
              value={batchMetadata.startedAt}
              onChange={(event) => setBatchMetadata((value) => ({ ...value, startedAt: event.target.value }))}
            />
            <Input
              label="结束时间（可选）"
              type="datetime-local"
              value={batchMetadata.finishedAt}
              onChange={(event) => setBatchMetadata((value) => ({ ...value, finishedAt: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="执行环境（可选）"
              value={batchMetadata.environment}
              onChange={(event) => setBatchMetadata((value) => ({ ...value, environment: event.target.value }))}
              placeholder="例如：SIT"
            />
            <Input
              label="构建版本（可选）"
              value={batchMetadata.buildVersion}
              onChange={(event) => setBatchMetadata((value) => ({ ...value, buildVersion: event.target.value }))}
              placeholder="例如：v2.3.1"
            />
          </div>
          <Input
            label="Commit SHA（可选）"
            value={batchMetadata.commitSha}
            onChange={(event) => setBatchMetadata((value) => ({ ...value, commitSha: event.target.value }))}
            placeholder="例如：a1b2c3d"
          />
          <Input
            label="流水线链接（可选）"
            type="url"
            value={batchMetadata.pipelineUrl}
            onChange={(event) => setBatchMetadata((value) => ({ ...value, pipelineUrl: event.target.value }))}
            placeholder="https://ci.example.com/pipelines/123"
          />
        </div>
      </Modal>

      <Modal
        open={!!editingBatch}
        onClose={() => {
          setEditingBatch(null);
          setBatchName('');
          setBatchMetadata(emptyBatchMetadata());
          setBatchError('');
        }}
        title="编辑批跑信息"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingBatch(null)}>
              取消
            </Button>
            <Button onClick={editBatch} loading={creatingBatch} loadingLabel="保存中…">
              保存修改
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="批跑名称"
            value={batchName}
            onChange={(event) => setBatchName(event.target.value)}
            error={batchError}
          />
          <Input
            label="执行时间"
            type="datetime-local"
            required
            value={batchMetadata.executedAt}
            onChange={(event) => setBatchMetadata((value) => ({ ...value, executedAt: event.target.value }))}
          />
          <p className="-mt-2 text-xs text-text-secondary">
            按当前设备时区填写，保存后统一转换为标准时间。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="开始时间（可选）"
              type="datetime-local"
              value={batchMetadata.startedAt}
              onChange={(event) => setBatchMetadata((value) => ({ ...value, startedAt: event.target.value }))}
            />
            <Input
              label="结束时间（可选）"
              type="datetime-local"
              value={batchMetadata.finishedAt}
              onChange={(event) => setBatchMetadata((value) => ({ ...value, finishedAt: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="执行环境（可选）"
              value={batchMetadata.environment}
              onChange={(event) => setBatchMetadata((value) => ({ ...value, environment: event.target.value }))}
            />
            <Input
              label="构建版本（可选）"
              value={batchMetadata.buildVersion}
              onChange={(event) => setBatchMetadata((value) => ({ ...value, buildVersion: event.target.value }))}
            />
          </div>
          <Input
            label="Commit SHA（可选）"
            value={batchMetadata.commitSha}
            onChange={(event) => setBatchMetadata((value) => ({ ...value, commitSha: event.target.value }))}
          />
          <Input
            label="流水线链接（可选）"
            type="url"
            value={batchMetadata.pipelineUrl}
            onChange={(event) => setBatchMetadata((value) => ({ ...value, pipelineUrl: event.target.value }))}
          />
        </div>
      </Modal>
    </PageContainer>
  );
}
