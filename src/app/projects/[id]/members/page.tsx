'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Select } from '@/components/shared/Select';
import { LoadingState } from '@/components/shared/LoadingState';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { ApiError, fetchJson } from '@/lib/fetch';
import type { ProjectMemberDTO, ProjectMembersResponse, ProjectRole } from '@/types';

const roleOptions = [
  { value: 'ADMIN', label: '项目管理员' },
  { value: 'EDITOR', label: '编辑者' },
  { value: 'VIEWER', label: '查看者' },
];

const roleLabel: Record<ProjectRole, string> = {
  ADMIN: '项目管理员',
  EDITOR: '编辑者',
  VIEWER: '查看者',
};

export default function ProjectMembersPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState<ProjectMemberDTO[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<ProjectRole>('EDITOR');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<ProjectMembersResponse>(`/api/projects/${id}/members`);
      setMembers(data.members);
      setCanManage(data.canManage);
    } catch (error) {
      showToast({
        message: error instanceof ApiError ? error.message : '加载项目成员失败',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    if (user) queueMicrotask(() => void load());
  }, [load, user]);

  const addMember = async () => {
    if (!username.trim()) return;
    setSaving(true);
    try {
      await fetchJson(`/api/projects/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), role }),
      });
      setUsername('');
      showToast({ message: '成员添加成功', type: 'success' });
      await load();
    } catch (error) {
      showToast({
        message: error instanceof ApiError ? error.message : '添加成员失败',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (member: ProjectMemberDTO, nextRole: ProjectRole) => {
    try {
      await fetchJson(`/api/projects/${id}/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      await load();
    } catch (error) {
      showToast({
        message: error instanceof ApiError ? error.message : '修改角色失败',
        type: 'error',
      });
    }
  };

  const removeMember = async (member: ProjectMemberDTO) => {
    if (!window.confirm(`确认移除成员“${member.username}”吗？`)) return;
    try {
      await fetchJson(`/api/projects/${id}/members/${member.id}`, { method: 'DELETE' });
      showToast({ message: '成员已移除', type: 'success' });
      await load();
    } catch (error) {
      showToast({
        message: error instanceof ApiError ? error.message : '移除成员失败',
        type: 'error',
      });
    }
  };

  return (
    <PageContainer
      title="项目成员"
      subtitle="控制项目内的查看、编辑与管理权限"
      actions={<Link href={`/projects/${id}`} className="text-sm text-accent">返回项目详情</Link>}
    >
      {authLoading || loading ? (
        <LoadingState label="正在加载项目成员" rows={4} />
      ) : (
        <div className="space-y-5">
          {canManage && (
            <div className="panel grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
              <Input
                label="用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="输入现有用户名"
              />
              <Select
                label="项目角色"
                options={roleOptions}
                value={role}
                onChange={(event) => setRole(event.target.value as ProjectRole)}
              />
              <Button onClick={addMember} disabled={saving || !username.trim()}>
                {saving ? '添加中...' : '添加成员'}
              </Button>
            </div>
          )}

          <div className="panel overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-bg/50 text-xs text-text-secondary">
                <tr>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">项目角色</th>
                  <th className="px-4 py-3">系统角色</th>
                  {canManage && <th className="px-4 py-3 text-right">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3 font-medium text-text-primary">{member.username}</td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <Select
                          aria-label={`修改 ${member.username} 的项目角色`}
                          value={member.role}
                          onChange={(event) => void changeRole(member, event.target.value as ProjectRole)}
                          className="h-9 min-w-36 px-2 py-1 text-sm"
                          options={roleOptions}
                        />
                      ) : roleLabel[member.role]}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{member.systemRole}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="danger" onClick={() => void removeMember(member)}>
                          移除
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!members.length && (
              <p className="p-8 text-center text-sm text-text-secondary">暂无项目成员</p>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
