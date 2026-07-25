'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { Badge } from '@/components/shared/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { fetchJson, ApiError } from '@/lib/fetch';
import type {
  ApiKeyResponse,
  ApiKeyCreateResponse,
  ApiKeysListResponse,
  ProjectsResponse,
} from '@/types';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN');
}

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user } = useAuth();
  const { showToast } = useToast();

  const [projectName, setProjectName] = useState<string>('');
  const [archived, setArchived] = useState<boolean>(false);
  const [stageCount, setStageCount] = useState<number>(0);
  const [projectLoading, setProjectLoading] = useState(true);

  const [keys, setKeys] = useState<ApiKeyResponse[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [issuedKey, setIssuedKey] = useState<string>('');
  const [issuedLabel, setIssuedLabel] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Load project info from the projects list (no single-project GET endpoint).
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await fetchJson<ProjectsResponse>(
          '/api/projects?includeArchived=true',
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        const project = data.projects.find((p) => p.id === id);
        if (!project) {
          setProjectName('');
          setArchived(false);
          setStageCount(0);
        } else {
          setProjectName(project.name);
          setArchived(project.archived);
          setStageCount(project.stageCount);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : '加载项目信息失败';
        showToast({ message, type: 'error' });
      } finally {
        if (!controller.signal.aborted) setProjectLoading(false);
      }
    })();
    return () => controller.abort();
  }, [user, id, showToast]);

  // Load API keys (admin only — API enforces role).
  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await fetchJson<ApiKeysListResponse>(
          `/api/projects/${id}/api-keys`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setKeys(data.keys);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : '加载 API Key 失败';
        showToast({ message, type: 'error' });
      } finally {
        if (!controller.signal.aborted) setKeysLoading(false);
      }
    })();
    return () => controller.abort();
  }, [user, id, showToast, reloadKey]);

  const openCreate = useCallback(() => {
    setNewLabel('');
    setCreateError('');
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setNewLabel('');
    setCreateError('');
  }, []);

  const handleCreate = useCallback(async () => {
    const label = newLabel.trim();
    if (!label) {
      setCreateError('标签为必填');
      return;
    }
    setCreateError('');
    setCreating(true);
    try {
      const data = await fetchJson<ApiKeyCreateResponse>(
        `/api/projects/${id}/api-keys`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: label }),
        }
      );
      setIssuedKey(data.key);
      setIssuedLabel(data.description || label);
      setCreateOpen(false);
      setNewLabel('');
      setReloadKey((k) => k + 1);
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : '创建失败');
    } finally {
      setCreating(false);
    }
  }, [id, newLabel]);

  const handleDelete = useCallback(
    async (keyId: string) => {
      if (!window.confirm('确定要删除该 API Key 吗？此操作不可撤销。')) return;
      try {
        await fetchJson(`/api/projects/${id}/api-keys/${keyId}`, {
          method: 'DELETE',
        });
        showToast({ message: 'API Key 已删除', type: 'success' });
        setReloadKey((k) => k + 1);
      } catch (error) {
        showToast({
          message: error instanceof ApiError ? error.message : '删除失败',
          type: 'error',
        });
      }
    },
    [id, showToast]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(issuedKey);
      setCopied(true);
      showToast({ message: '已复制到剪贴板', type: 'success' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({ message: '复制失败，请手动复制', type: 'error' });
    }
  }, [issuedKey, showToast]);

  const dismissIssued = useCallback(() => {
    setIssuedKey('');
    setIssuedLabel('');
    setCopied(false);
  }, []);

  if (!user) {
    return (
      <PageContainer title="项目设置" subtitle="管理项目信息和 API Key">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-text-secondary">请先登录以访问项目设置</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="项目设置"
      subtitle="查看项目基本信息并管理 API Key"
      actions={
        <Link
          href={`/projects/${id}`}
          className="text-sm text-text-secondary hover:text-accent"
        >
          返回项目
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Project info */}
        <div className="panel p-lg">
          <h2 className="text-lg font-semibold text-text-primary">项目信息</h2>
          {projectLoading ? (
            <p className="mt-md text-sm text-text-secondary">加载中...</p>
          ) : projectName ? (
            <dl className="mt-md grid grid-cols-1 gap-md text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold text-text-secondary">名称</dt>
                <dd className="mt-1 text-text-primary">{projectName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-secondary">阶段数</dt>
                <dd className="mt-1 text-text-primary">{stageCount}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-secondary">状态</dt>
                <dd className="mt-1">
                  {archived ? (
                    <Badge progress="blocked">已归档</Badge>
                  ) : (
                    <Badge progress="fixed">活跃</Badge>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-md text-sm text-text-secondary">项目不存在或已被删除</p>
          )}
        </div>

        {/* API Keys */}
        <div className="panel p-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">API Key</h2>
              <p className="mt-1 text-xs text-text-secondary">
                用于外部系统调用本项目相关接口，密钥仅在创建时显示一次。
              </p>
            </div>
            {user.role === 'ADMIN' && (
              <Button onClick={openCreate}>创建 API Key</Button>
            )}
          </div>

          {user.role !== 'ADMIN' ? (
            <div className="mt-md panel flex items-center justify-center p-md text-sm text-text-secondary">
              API Key 管理仅对管理员开放
            </div>
          ) : keysLoading ? (
            <div className="mt-md flex items-center justify-center p-md">
              <p className="text-sm text-text-secondary">加载中...</p>
            </div>
          ) : keys.length === 0 ? (
            <div className="mt-md">
              <EmptyState
                title="暂无 API Key"
                description="点击右上角按钮创建第一个 API Key"
                actionLabel="创建 API Key"
                onAction={openCreate}
              />
            </div>
          ) : (
            <div className="mt-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg/60 text-left text-xs font-semibold text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">标签</th>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">创建时间</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keys.map((key) => (
                    <tr key={key.id} className="hover:bg-bg/40">
                      <td className="px-4 py-3 text-text-primary">
                        {key.description || '(无标签)'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {key.id}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDateTime(key.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(key.id)}
                        >
                          删除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="创建 API Key"
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? '创建中...' : '创建'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="标签"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="例如 CI 流水线"
            error={createError}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <p className="text-xs text-text-secondary">
            创建后将显示一次完整密钥，请妥善保存。
          </p>
        </div>
      </Modal>

      {/* Newly-issued key (shown only once) */}
      <Modal
        open={!!issuedKey}
        onClose={dismissIssued}
        title="API Key 已创建"
        footer={
          <Button onClick={dismissIssued}>我已保存，关闭</Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            标签：<span className="text-text-primary">{issuedLabel || '(无标签)'}</span>
          </p>
          <p className="text-xs text-text-secondary">
            请立即复制以下密钥。关闭后将无法再次查看完整密钥。
          </p>
          <div className="flex items-stretch gap-2">
            <pre
              data-testid="issued-key"
              className="flex-1 overflow-x-auto rounded-md border border-border bg-bg/60 p-sm font-mono text-xs text-text-primary"
            >
              {issuedKey}
            </pre>
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}