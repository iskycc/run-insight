'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { Select } from '@/components/shared/Select';
import { LoadingState } from '@/components/shared/LoadingState';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { formatDateTime } from '@/lib/date-time';
import { ApiError, fetchJson } from '@/lib/fetch';
import type { Role, UserWithRole, UsersResponse } from '@/types';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: '管理员' },
  { value: 'EDITOR', label: '编辑者' },
  { value: 'VIEWER', label: '查看者' },
];

interface CreateForm {
  username: string;
  password: string;
  role: Role;
}

interface ResetPasswordForm {
  newPassword: string;
  confirmPassword: string;
}

export default function AdminUsersPage() {
  const { user, updateCurrentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserWithRole[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    username: '',
    password: '',
    role: 'VIEWER',
  });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserWithRole | null>(null);
  const [resetForm, setResetForm] = useState<ResetPasswordForm>({
    newPassword: '',
    confirmPassword: '',
  });
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<UserWithRole | null>(null);
  const [renameUsername, setRenameUsername] = useState('');
  const [renameError, setRenameError] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchJson<UsersResponse>('/api/users');
        if (!cancelled) {
          setUsers(data.users);
          setLoadError(null);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) {
          setLoadError('权限不足，仅管理员可访问');
        } else if (error instanceof ApiError && error.status === 401) {
          setLoadError('请先登录');
        } else {
          setLoadError(error instanceof ApiError ? error.message : '加载用户失败');
        }
        setUsers(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const adminCount = users?.filter((u) => u.role === 'ADMIN').length ?? 0;
  const editorCount = users?.filter((u) => u.role === 'EDITOR').length ?? 0;
  const viewerCount = users?.filter((u) => u.role === 'VIEWER').length ?? 0;
  const currentUserId = user?.id;

  const handleCreate = useCallback(async () => {
    const username = createForm.username.trim();
    const password = createForm.password;
    if (!username) {
      setCreateError('用户名为必填');
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setCreateError('密码长度必须为 8 到 128 个字符');
      return;
    }
    setCreateError('');
    setIsCreating(true);
    try {
      await fetchJson<UserWithRole>('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role: createForm.role }),
      });
      showToast({ message: '用户创建成功', type: 'success' });
      setCreateOpen(false);
      setCreateForm({ username: '', password: '', role: 'VIEWER' });
      setReloadKey((k) => k + 1);
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : '创建失败');
    } finally {
      setIsCreating(false);
    }
  }, [createForm, showToast]);

  const handleRoleChange = useCallback(
    async (target: UserWithRole, nextRole: Role) => {
      if (nextRole === target.role) return;
      setPendingId(target.id);
      try {
        await fetchJson<UserWithRole>(`/api/users/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: nextRole }),
        });
        showToast({ message: '角色已更新', type: 'success' });
        setReloadKey((k) => k + 1);
      } catch (error) {
        showToast({
          message: error instanceof ApiError ? error.message : '更新失败',
          type: 'error',
        });
      } finally {
        setPendingId(null);
      }
    },
    [showToast],
  );

  const isSelf = (target: UserWithRole) => !!currentUserId && target.id === currentUserId;
  const isLastAdmin = (target: UserWithRole) =>
    target.role === 'ADMIN' && adminCount <= 1;

  const closeRenameModal = useCallback(() => {
    if (isRenaming) return;
    setRenameTarget(null);
    setRenameUsername('');
    setRenameError('');
  }, [isRenaming]);

  const handleRename = useCallback(async () => {
    if (!renameTarget) return;
    const username = renameUsername.normalize('NFKC').trim();
    if (
      username.length < 3
      || username.length > 50
      || /[\s\u0000-\u001f\u007f]/u.test(username)
    ) {
      setRenameError('用户名必须为 3 到 50 个字符，且不能包含空格或控制字符');
      return;
    }

    setRenameError('');
    setIsRenaming(true);
    try {
      const updated = await fetchJson<UserWithRole>(
        `/api/users/${renameTarget.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        },
      );
      if (renameTarget.id === currentUserId) {
        updateCurrentUser({ username: updated.username });
      }
      showToast({ message: '用户名已更新', type: 'success' });
      setRenameTarget(null);
      setRenameUsername('');
      setReloadKey((key) => key + 1);
    } catch (error) {
      setRenameError(error instanceof ApiError ? error.message : '修改用户名失败');
    } finally {
      setIsRenaming(false);
    }
  }, [
    renameTarget,
    renameUsername,
    showToast,
    updateCurrentUser,
    currentUserId,
  ]);

  const closeResetModal = useCallback(() => {
    if (isResetting) return;
    setResetTarget(null);
    setResetForm({ newPassword: '', confirmPassword: '' });
    setResetError('');
  }, [isResetting]);

  const handleResetPassword = useCallback(async () => {
    if (!resetTarget) return;
    const { newPassword, confirmPassword } = resetForm;
    if (newPassword.length < 8 || newPassword.length > 128) {
      setResetError('新密码长度必须为 8 到 128 个字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('两次输入的新密码不一致');
      return;
    }

    setResetError('');
    setIsResetting(true);
    try {
      await fetchJson<{ success: true }>(`/api/users/${resetTarget.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
        reloadOnUnauthorized: false,
      });
      showToast({ message: `已重置 ${resetTarget.username} 的密码`, type: 'success' });
      setResetTarget(null);
      setResetForm({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      let message = error instanceof ApiError ? error.message : '重置密码失败';
      if (error instanceof ApiError && error.status === 401) message = '登录状态已失效，请重新登录';
      if (error instanceof ApiError && error.status === 403) message = '权限不足，仅管理员可重置密码';
      setResetError(message);
      showToast({ message, type: 'error' });
    } finally {
      setIsResetting(false);
    }
  }, [resetForm, resetTarget, showToast]);

  if (loadError) {
    return (
      <PageContainer title="用户管理" subtitle="创建用户、调整角色">
        <div className="panel flex items-center justify-center p-10">
          <p className="text-sm text-danger">{loadError}</p>
        </div>
      </PageContainer>
    );
  }

  if (!users) {
    return (
      <PageContainer title="用户管理" subtitle="创建用户、调整角色">
        <div className="panel flex items-center justify-center p-10">
          <LoadingState label="正在加载用户" rows={5} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="用户管理"
      subtitle="创建用户、调整角色"
      actions={<Button onClick={() => setCreateOpen(true)}>新建用户</Button>}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['全部用户', users.length],
          ['管理员', adminCount],
          ['编辑者', editorCount],
          ['查看者', viewerCount],
        ].map(([label, count]) => (
          <div key={String(label)} className="surface-subtle px-4 py-3">
            <p className="text-xs font-medium text-text-secondary">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{count}</p>
          </div>
        ))}
      </div>
      <div className="bento-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-bg/60 text-left text-xs font-semibold text-text-secondary">
              <tr>
                <th className="px-4 py-3">用户名</th>
                <th className="px-4 py-3">认证方式</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">更新时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const self = isSelf(u);
                const lastAdmin = isLastAdmin(u);
                const ldapUser = u.authSource === 'LDAP';
                const disabled = self || lastAdmin;
                const reason = self
                  ? '不能修改自己的角色'
                  : lastAdmin
                    ? '系统中至少需保留一名管理员'
                    : undefined;
                return (
                  <tr key={u.id} className="hover:bg-bg/40">
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {u.username}
                      {self && (
                        <span className="ml-2 text-xs text-text-secondary">(我)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          ldapUser
                            ? 'bg-accent/10 text-accent'
                            : 'bg-bg text-text-secondary'
                        }`}
                      >
                        {ldapUser ? 'LDAP' : '本地'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        options={ROLE_OPTIONS}
                        value={u.role}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = e.target.value as Role;
                          void handleRoleChange(u, next);
                        }}
                        title={reason}
                      />
                      {reason && (
                        <p className="mt-1 text-xs text-text-secondary">{reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDateTime(u.createdAt)}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatDateTime(u.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {!ldapUser && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setRenameTarget(u);
                              setRenameUsername(u.username);
                              setRenameError('');
                            }}
                            aria-label={`修改 ${u.username} 的用户名`}
                          >
                            修改用户名
                          </Button>
                        )}
                        {!ldapUser && u.id !== user?.id && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setResetTarget(u);
                              setResetForm({ newPassword: '', confirmPassword: '' });
                              setResetError('');
                            }}
                            aria-label={`重置 ${u.username} 的密码`}
                          >
                            重置密码
                          </Button>
                        )}
                        {ldapUser && (
                          <span className="text-xs text-text-secondary">
                            目录管理
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pendingId && (
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-xs text-text-secondary">
                    更新中...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={renameTarget !== null}
        onClose={closeRenameModal}
        title="修改用户名"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeRenameModal}
              disabled={isRenaming}
            >
              取消
            </Button>
            <Button
              type="submit"
              form="rename-user-form"
              loading={isRenaming}
              loadingLabel="保存中…"
            >
              保存
            </Button>
          </>
        }
      >
        <form
          id="rename-user-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleRename();
          }}
          noValidate
        >
          <p className="text-sm text-text-secondary">
            修改后请使用新用户名登录。其他登录会话将被注销。
          </p>
          <Input
            label="新用户名"
            value={renameUsername}
            onChange={(event) => setRenameUsername(event.target.value)}
            disabled={isRenaming}
            minLength={3}
            maxLength={50}
            required
            error={renameError}
          />
        </form>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => {
          if (isCreating) return;
          setCreateOpen(false);
          setCreateForm({ username: '', password: '', role: 'VIEWER' });
          setCreateError('');
        }}
        title="新建用户"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setCreateForm({ username: '', password: '', role: 'VIEWER' });
                setCreateError('');
              }}
              disabled={isCreating}
            >
              取消
            </Button>
            <Button onClick={handleCreate} loading={isCreating} loadingLabel="创建中…">
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="用户名"
            value={createForm.username}
            onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
            placeholder="输入用户名"
            error={createError}
            disabled={isCreating}
          />
          <Input
            label="密码"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="输入初始密码"
            disabled={isCreating}
            minLength={8}
            maxLength={128}
          />
          <Select
            label="角色"
            options={ROLE_OPTIONS}
            value={createForm.role}
            onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as Role }))}
            disabled={isCreating}
          />
        </div>
      </Modal>

      <Modal
        open={resetTarget !== null}
        onClose={closeResetModal}
        title="重置密码"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeResetModal}
              disabled={isResetting}
            >
              取消
            </Button>
            <Button
              type="submit"
              form="reset-password-form"
              disabled={isResetting}
            >
              {isResetting ? '重置中...' : '确认重置'}
            </Button>
          </>
        }
      >
        <form
          id="reset-password-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleResetPassword();
          }}
          noValidate
        >
          <p className="text-sm text-text-secondary">
            为用户 <span className="font-medium text-text-primary">{resetTarget?.username}</span>{' '}
            设置新密码。
          </p>
          <Input
            label="新密码"
            type="password"
            autoComplete="new-password"
            value={resetForm.newPassword}
            onChange={(event) =>
              setResetForm((form) => ({ ...form, newPassword: event.target.value }))
            }
            disabled={isResetting}
            minLength={8}
            maxLength={128}
            required
          />
          <Input
            label="确认新密码"
            type="password"
            autoComplete="new-password"
            value={resetForm.confirmPassword}
            onChange={(event) =>
              setResetForm((form) => ({ ...form, confirmPassword: event.target.value }))
            }
            disabled={isResetting}
            minLength={8}
            maxLength={128}
            required
          />
          {resetError && (
            <p className="text-sm text-danger" role="alert">
              {resetError}
            </p>
          )}
        </form>
      </Modal>
    </PageContainer>
  );
}
