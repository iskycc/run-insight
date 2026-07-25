'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { CaseDetail, type CaseDetailData } from '@/components/case/CaseDetail';
import { EditAnalysisModal } from '@/components/case/EditAnalysisModal';
import { SaveAssetModal } from '@/components/shared/SaveAssetModal';
import { Button } from '@/components/shared/Button';
import { useAuth } from '@/components/shared/AuthProvider';
import type {
  CaseActivityDTO,
  CasePriority,
  ProjectMemberDTO,
  ProjectMembersResponse,
  RootCauseCategoriesResponse,
  RootCauseCategoryDTO,
} from '@/types';

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [canEditProject, setCanEditProject] = useState(false);
  const [members, setMembers] = useState<ProjectMemberDTO[]>([]);
  const [activities, setActivities] = useState<CaseActivityDTO[]>([]);
  const [rootCauseCategories, setRootCauseCategories] = useState<RootCauseCategoryDTO[]>([]);
  const [comment, setComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [caseData, setCaseData] = useState<CaseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saveAssetOpen, setSaveAssetOpen] = useState(false);

  const caseId = params.id as string;
  const canEdit = user?.role === 'ADMIN' || canEditProject;

  const getCase = useCallback(async () => {
    const res = await fetch(`/api/cases/${caseId}`);
    if (!res.ok) {
      if (res.status === 404) return { case: null, error: '用例不存在' };
      return { case: null, error: '加载失败' };
    }

    const data = await res.json();
    return { case: data.case as CaseDetailData, error: '' };
  }, [caseId]);

  const fetchCase = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getCase();
      setCaseData(result.case);
      setError(result.error);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [getCase]);

  const loadCollaboration = useCallback(async (projectId: string) => {
    const [membersResponse, activitiesResponse, categoriesResponse] = await Promise.all([
      fetch(`/api/projects/${projectId}/members`),
      fetch(`/api/cases/${caseId}/activities`),
      fetch(`/api/root-cause-categories?projectId=${encodeURIComponent(projectId)}`),
    ]);
    if (membersResponse.ok) {
      const data = await membersResponse.json() as ProjectMembersResponse;
      setMembers(data.members);
      const membership = data.members.find((member) => member.userId === user?.id);
      setCanEditProject(membership?.role === 'ADMIN' || membership?.role === 'EDITOR');
    }
    if (activitiesResponse.ok) {
      const data = await activitiesResponse.json() as { activities: CaseActivityDTO[] };
      setActivities(data.activities);
    }
    if (categoriesResponse.ok) {
      const data = await categoriesResponse.json() as RootCauseCategoriesResponse;
      setRootCauseCategories(data.categories);
    }
  }, [caseId, user?.id]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
      return;
    }
    if (!user) {
      return;
    }

    let isActive = true;

    async function loadCase() {
      try {
        const result = await getCase();
        if (!isActive) return;

        setCaseData(result.case);
        setError(result.error);
      } catch {
        if (isActive) setError('网络错误');
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadCase();

    return () => {
      isActive = false;
    };
  }, [user, authLoading, getCase, router]);

  useEffect(() => {
    if (caseData?.projectId && user) {
      queueMicrotask(() => void loadCollaboration(caseData.projectId));
    }
  }, [caseData?.projectId, loadCollaboration, user]);

  const handleSaveAnalysis = async (data: {
    assignee: string;
    assigneeId?: string | null;
    priority?: CasePriority | null;
    dueDate?: string | null;
    progressCategory: string;
    rootCause: string;
    rootCauseCategoryId?: string | null;
    mrOrTicket: string;
    notes: string;
  }) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditOpen(false);
        await fetchCase();
        if (caseData) await loadCollaboration(caseData.projectId);
      }
    } catch {
      // 静默处理，保持弹窗打开让用户重试
    }
  };

  const handleComment = async () => {
    if (!canEdit || !comment.trim()) return;
    setCommenting(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      if (response.ok && caseData) {
        setComment('');
        await loadCollaboration(caseData.projectId);
      }
    } finally {
      setCommenting(false);
    }
  };

  const handleSaveAsset = async (id: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/cases/${id}/save-asset`, { method: 'PATCH' });
      if (res.ok) {
        setSaveAssetOpen(false);
        await fetchCase();
      }
    } catch {
      // 静默处理
    }
  };

  if (authLoading || loading) {
    return (
      <PageContainer title="用例明细">
        <div className="flex items-center justify-center py-2xl">
          <div className="text-text-secondary text-sm">加载中…</div>
        </div>
      </PageContainer>
    );
  }

  if (error || !caseData) {
    return (
      <PageContainer title="用例明细">
        <div className="flex flex-col items-center justify-center py-2xl gap-sm">
          <div className="text-text-secondary text-sm">{error || '用例不存在'}</div>
          <button
            onClick={() => router.push('/workspace')}
            className="text-accent hover:text-accent-hover text-sm"
          >
            返回工作台
          </button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="用例明细" subtitle={caseData.caseNo}>
      <CaseDetail
        canEdit={canEdit}
        caseData={caseData}
        onEdit={() => setEditOpen(true)}
        onSaveAsset={() => setSaveAssetOpen(true)}
      />

      {canEdit && (
        <>
          <EditAnalysisModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            onSave={handleSaveAnalysis}
            initialData={{
              assignee: caseData.assignee ?? '',
              assigneeId: caseData.assigneeId ?? null,
              priority: caseData.priority ?? null,
              dueDate: caseData.dueDate ?? null,
              progressCategory: caseData.progressCategory ?? '',
              rootCause: caseData.rootCause ?? '',
              rootCauseCategoryId: caseData.rootCauseCategoryId ?? null,
              mrOrTicket: caseData.mrOrTicket ?? '',
              notes: caseData.notes ?? '',
            }}
            members={members}
            rootCauseCategories={rootCauseCategories}
          />

          <SaveAssetModal
            open={saveAssetOpen}
            onClose={() => setSaveAssetOpen(false)}
            onConfirm={handleSaveAsset}
            caseData={caseData}
          />
        </>
      )}

      <section className="panel mt-lg p-lg" aria-label="分析时间线">
        <h2 className="mb-md text-sm font-semibold text-text-primary">分析时间线</h2>
        {canEdit && (
          <div className="mb-lg flex flex-col gap-2">
            <textarea
              aria-label="发表评论"
              value={comment}
              maxLength={5000}
              rows={3}
              onChange={(event) => setComment(event.target.value)}
              placeholder="记录分析过程或补充说明"
              className="field-control w-full resize-y px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleComment} disabled={commenting || !comment.trim()}>
                {commenting ? '发表中...' : '发表评论'}
              </Button>
            </div>
          </div>
        )}
        {activities.length ? (
          <ol className="space-y-3">
            {activities.map((activity) => (
              <li key={activity.id} className="border-l-2 border-border pl-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">{activity.user.username}</span>
                  <span>{activity.type === 'COMMENT' ? '发表了评论' : '更新了分析信息'}</span>
                  <time>{new Date(activity.createdAt).toLocaleString('zh-CN')}</time>
                </div>
                {activity.comment && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-primary">
                    {activity.comment}
                  </p>
                )}
                {activity.changes && (
                  <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                    {Object.entries(activity.changes).map(([field, value]) => (
                      <li key={field}>
                        {field}：{String(value.from ?? '—')} → {String(value.to ?? '—')}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-text-secondary">暂无分析动态</p>
        )}
      </section>
    </PageContainer>
  );
}
