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
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN');
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
    setCreatingBatch(true);
    setBatchError('');
    try {
      await fetchJson<{ batch: BatchScopeDTO }>(
        `/api/stages/${batchStage.id}/batches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }
      );
      const stageId = batchStage.id;
      setBatchStage(null);
      setBatchName('');
      showToast({ message: '批跑创建成功', type: 'success' });
      await loadBatches(stageId, true);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setBatchError(error instanceof ApiError ? error.message : '创建批跑失败');
    } finally {
      setCreatingBatch(false);
    }
  }, [batchName, batchStage, loadBatches, showToast]);

  const updateArchive = useCallback(
    async (kind: 'stage' | 'batch', item: TestStageWithStats | BatchScopeWithStats) => {
      const label = kind === 'stage' ? '阶段' : '批跑';
      if (!window.confirm(item.archived ? `确定取消归档该${label}吗？` : `确定归档该${label}吗？`)) {
        return;
      }
      try {
        await fetchJson(`/api/${kind === 'stage' ? 'stages' : 'batches'}/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !item.archived }),
        });
        showToast({
          message: item.archived ? `${label}已取消归档` : `${label}已归档`,
          type: 'success',
        });
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

  const deleteItem = useCallback(
    async (kind: 'stage' | 'batch', item: TestStageWithStats | BatchScopeWithStats) => {
      const label = kind === 'stage' ? '阶段' : '批跑';
      if (!window.confirm(`确定删除该${label}吗？其关联数据也会被删除，此操作不可撤销。`)) {
        return;
      }
      try {
        await fetchJson(`/api/${kind === 'stage' ? 'stages' : 'batches'}/${item.id}`, {
          method: 'DELETE',
        });
        showToast({ message: `${label}已删除`, type: 'success' });
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

  if (authLoading) {
    return (
      <PageContainer title="项目详情">
        <div className="panel p-10 text-center text-sm text-text-secondary">加载中...</div>
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
          <p className="text-sm text-text-secondary">该项目不存在或已被删除</p>
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
            此项目已归档。取消归档后才能继续创建阶段或批跑。
          </div>
        )}

        <section aria-label="项目概览" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="panel col-span-2 overflow-hidden p-5 lg:col-span-2">
            <p className="text-xs font-semibold text-text-secondary">整体通过率</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-4xl font-semibold tracking-tight text-text-primary">
                {rate(project?.passCount ?? 0, project?.caseCount ?? 0)}
              </p>
              <Badge progress="fixed">{project?.archived ? '已归档' : '运行中'}</Badge>
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
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => {
                  setShowArchived(event.target.checked);
                  setExpandedStageId(null);
                  setBatchStates({});
                }}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              显示已归档
            </label>
          </div>

          <div className="panel overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-text-secondary">加载中...</div>
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
                              {stage.archived && <Badge progress="blocked">已归档</Badge>}
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
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => void updateArchive('stage', stage)}
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg"
                                  >
                                    {stage.archived ? '取消归档' : '归档阶段'}
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => void deleteItem('stage', stage)}
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                                  >
                                    删除阶段
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
                            <p className="text-sm text-text-secondary">批跑加载中...</p>
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
                                      {batch.archived && <Badge progress="blocked">已归档</Badge>}
                                    </div>
                                    <p className="mt-1 text-xs text-text-secondary">
                                      {batch.caseCount} 个用例 ·
                                      <span className="ml-1 text-success">{batch.passCount} 通过</span>
                                      <span className="ml-1 text-danger">{batch.failCount} 失败</span>
                                    </p>
                                  </div>
                                  <Link
                                    href={`/workspace?projectId=${id}&testStageId=${stage.id}&batchScopeId=${batch.id}`}
                                    className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/15"
                                  >
                                    查看用例
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
                                        {canEdit && (
                                          <button
                                            type="button"
                                            onClick={() => void updateArchive('batch', batch)}
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg"
                                          >
                                            {batch.archived ? '取消归档' : '归档批跑'}
                                          </button>
                                        )}
                                        {canDelete && (
                                          <button
                                            type="button"
                                            onClick={() => void deleteItem('batch', batch)}
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                                          >
                                            删除批跑
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
            <Button onClick={createStage} disabled={creatingStage}>
              {creatingStage ? '创建中...' : '创建阶段'}
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
          setBatchError('');
        }}
        title={`新建批跑${batchStage ? ` · ${batchStage.name}` : ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBatchStage(null)}>
              取消
            </Button>
            <Button onClick={createBatch} disabled={creatingBatch}>
              {creatingBatch ? '创建中...' : '创建批跑'}
            </Button>
          </>
        }
      >
        <Input
          label="批跑名称"
          value={batchName}
          onChange={(event) => setBatchName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void createBatch();
          }}
          error={batchError}
          placeholder="例如：2026-07-25 回归"
        />
      </Modal>
    </PageContainer>
  );
}
