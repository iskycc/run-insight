'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { Badge } from '@/components/shared/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { fetchJson, ApiError } from '@/lib/fetch';
import { ArrowRight, DotsThree } from '@phosphor-icons/react';
import type { ProjectWithStats, ProjectsResponse, ProjectDTO } from '@/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN');
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await fetchJson<ProjectsResponse>(
          `/api/projects?includeArchived=${showArchived}`,
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setProjects(data.projects);
          setLoadState('ready');
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : '加载项目失败';
        setLoadState('error');
        showToast({ message, type: 'error' });
      }
    })();
    return () => controller.abort();
  }, [user, showArchived, showToast, reloadKey]);

  const loading = loadState === 'idle' || loadState === 'loading';
  const canEdit = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  const handleCreate = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) {
      setCreateError('项目名称为必填');
      return;
    }
    setCreateError('');
    setIsCreating(true);
    try {
      const data = await fetchJson<{ project: ProjectDTO }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      showToast({ message: '项目创建成功', type: 'success' });
      setCreateModalOpen(false);
      setNewProjectName('');
      router.push(`/projects/${data.project.id}`);
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : '创建失败');
    } finally {
      setIsCreating(false);
    }
  }, [newProjectName, router, showToast]);

  const handleArchive = useCallback(async (project: ProjectWithStats) => {
    if (!window.confirm(project.archived ? '确定要取消归档该项目吗？' : '确定要归档该项目吗？')) return;
    try {
      await fetchJson(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archived }),
      });
      showToast({ message: project.archived ? '项目已取消归档' : '项目已归档', type: 'success' });
      setReloadKey((k) => k + 1);
    } catch (error) {
      showToast({ message: error instanceof ApiError ? error.message : '操作失败', type: 'error' });
    }
  }, [showToast]);

  const handleDelete = useCallback(async (project: ProjectWithStats) => {
    if (!window.confirm('确定要删除该项目吗？此操作不可撤销。')) return;
    try {
      await fetchJson(`/api/projects/${project.id}`, { method: 'DELETE' });
      showToast({ message: '项目已删除', type: 'success' });
      setReloadKey((k) => k + 1);
    } catch (error) {
      showToast({ message: error instanceof ApiError ? error.message : '删除失败', type: 'error' });
    }
  }, [showToast]);

  if (!user) {
    return (
      <PageContainer title="项目管理" subtitle="管理项目、阶段与批跑">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-text-secondary">请先登录以访问项目管理</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="项目管理"
      subtitle="创建、归档和管理项目"
      actions={
        canEdit ? <Button onClick={() => setCreateModalOpen(true)}>新建项目</Button> : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            显示已归档项目
          </label>
        </div>

        <div className="panel overflow-hidden p-3 sm:p-4">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <p className="text-sm text-text-secondary">加载中...</p>
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title="暂无项目"
              description={canEdit ? '点击右上角按钮创建第一个项目' : '当前还没有可查看的项目'}
              actionLabel={canEdit ? '新建项目' : undefined}
              onAction={canEdit ? () => setCreateModalOpen(true) : undefined}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const total = project.passCount + project.failCount;
                const passRate = total > 0 ? Math.round((project.passCount / total) * 100) : 0;

                return (
                  <article
                    key={project.id}
                    className="group relative flex min-w-0 flex-col overflow-visible rounded-2xl border border-border/80 bg-surface p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          {project.archived ? (
                            <Badge progress="blocked">已归档</Badge>
                          ) : (
                            <Badge progress="fixed">活跃项目</Badge>
                          )}
                          <span className="text-xs text-text-secondary">
                            创建于 {formatDate(project.createdAt)}
                          </span>
                        </div>
                        <h2 className="truncate text-lg font-semibold tracking-tight text-text-primary">
                          {project.name}
                        </h2>
                      </div>

                      {(project.canEdit || project.canAdmin) && (
                        <details className="relative shrink-0">
                          <summary
                            className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-bg text-lg leading-none text-text-secondary transition hover:border-accent/30 hover:bg-surface-solid hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 [&::-webkit-details-marker]:hidden"
                            aria-label={`管理项目 ${project.name}`}
                          >
                            <DotsThree size={22} weight="bold" aria-hidden="true" />
                          </summary>
                          <div className="absolute right-0 top-11 z-20 w-36 overflow-hidden rounded-xl border border-border bg-surface-solid p-1.5 shadow-lg">
                            {project.canEdit && (
                              <button
                                type="button"
                                onClick={() => void handleArchive(project)}
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-bg"
                              >
                                {project.archived ? '取消归档' : '归档项目'}
                              </button>
                            )}
                            {project.canAdmin && (
                              <button
                                type="button"
                                onClick={() => void handleDelete(project)}
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                              >
                                删除项目
                              </button>
                            )}
                          </div>
                        </details>
                      )}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      {[
                        ['阶段', project.stageCount],
                        ['用例', project.caseCount],
                        ['通过', project.passCount],
                        ['失败', project.failCount],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-bg/75 px-3 py-3">
                          <p className="text-xs text-text-secondary">{label}</p>
                          <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-text-secondary">通过率</span>
                        <span className="font-semibold tabular-nums text-text-primary">
                          {total > 0 ? `${passRate}%` : '暂无结果'}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border/70">
                        <div
                          className="h-full rounded-full bg-success transition-[width]"
                          style={{ width: `${passRate}%` }}
                        />
                      </div>
                    </div>

                    <Link
                      href={`/projects/${project.id}`}
                      className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                      进入项目
                      <ArrowRight size={16} weight="bold" aria-hidden="true" className="ml-2" />
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setNewProjectName('');
          setCreateError('');
        }}
        title="新建项目"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateModalOpen(false);
                setNewProjectName('');
                setCreateError('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? '创建中...' : '创建'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="项目名称"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="输入项目名称"
            error={createError}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
        </div>
      </Modal>
    </PageContainer>
  );
}
