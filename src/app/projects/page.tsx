'use client';

import { useEffect, useState, useCallback } from 'react';
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
        <Button onClick={() => setCreateModalOpen(true)}>新建项目</Button>
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

        <div className="panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <p className="text-sm text-text-secondary">加载中...</p>
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title="暂无项目"
              description="点击右上角按钮创建第一个项目"
              actionLabel="新建项目"
              onAction={() => setCreateModalOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg/60 text-left text-xs font-semibold text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">项目名称</th>
                    <th className="px-4 py-3">阶段</th>
                    <th className="px-4 py-3">用例</th>
                    <th className="px-4 py-3">通过 / 失败</th>
                    <th className="px-4 py-3">创建时间</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-bg/40">
                      <td className="px-4 py-3 font-medium text-text-primary">
                        <button
                          onClick={() => router.push(`/projects/${project.id}`)}
                          className="text-left hover:text-accent hover:underline"
                        >
                          {project.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{project.stageCount}</td>
                      <td className="px-4 py-3 text-text-secondary">{project.caseCount}</td>
                      <td className="px-4 py-3">
                        <span className="text-success">{project.passCount}</span>
                        <span className="mx-1 text-text-secondary">/</span>
                        <span className="text-danger">{project.failCount}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(project.createdAt)}</td>
                      <td className="px-4 py-3">
                        {project.archived ? <Badge progress="blocked">已归档</Badge> : <Badge progress="fixed">活跃</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleArchive(project)}
                          >
                            {project.archived ? '取消归档' : '归档'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDelete(project)}
                          >
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
