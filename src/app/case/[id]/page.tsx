'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { CaseDetail, type CaseDetailData } from '@/components/case/CaseDetail';
import { ActivityTimeline } from '@/components/case/ActivityTimeline';
import { EditAnalysisModal } from '@/components/case/EditAnalysisModal';
import { SaveAssetModal } from '@/components/shared/SaveAssetModal';
import { useAuth } from '@/components/shared/AuthProvider';
import type {
  CaseActivityDTO,
  CasePriority,
  ProjectMemberDTO,
  ProjectMembersResponse,
  RootCauseCategoriesResponse,
  RootCauseCategoryDTO,
} from '@/types';

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: unknown };
    return typeof body.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [canEditProject, setCanEditProject] = useState(false);
  const [members, setMembers] = useState<ProjectMemberDTO[]>([]);
  const [activities, setActivities] = useState<CaseActivityDTO[]>([]);
  const [canComment, setCanComment] = useState(false);
  const [rootCauseCategories, setRootCauseCategories] = useState<RootCauseCategoryDTO[]>([]);
  const [comment, setComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [caseData, setCaseData] = useState<CaseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saveAssetOpen, setSaveAssetOpen] = useState(false);
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);

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
    try {
      const [membersResponse, activitiesResponse, categoriesResponse, watchResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}/members`),
        fetch(`/api/cases/${caseId}/activities`),
        fetch(`/api/root-cause-categories?projectId=${encodeURIComponent(projectId)}`),
        fetch(`/api/cases/${caseId}/watch`),
      ]);
      if (membersResponse.ok) {
        const data = await membersResponse.json() as ProjectMembersResponse;
        setMembers(data.members);
        const membership = data.members.find((member) => member.userId === user?.id);
        setCanEditProject(membership?.role === 'ADMIN' || membership?.role === 'EDITOR');
      }
      if (activitiesResponse.ok) {
        const data = await activitiesResponse.json() as {
          activities: CaseActivityDTO[];
          canComment: boolean;
        };
        setActivities(data.activities);
        setCanComment(data.canComment);
        setActivityError('');
      } else {
        setCanComment(false);
        setActivityError(await responseError(activitiesResponse, '加载分析动态失败'));
      }
      if (categoriesResponse.ok) {
        const data = await categoriesResponse.json() as RootCauseCategoriesResponse;
        setRootCauseCategories(data.categories);
      }
      if (watchResponse.ok) {
        const data = await watchResponse.json() as { watching: boolean };
        setWatching(data.watching);
      }
    } catch {
      setCanComment(false);
      setActivityError('加载协作信息失败，请稍后重试');
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
    if (!canComment || !comment.trim()) return;
    setActivityError('');
    setCommenting(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      if (response.ok) {
        const data = await response.json() as { activity: CaseActivityDTO };
        setComment('');
        setActivities((current) => [data.activity, ...current]);
      } else {
        setActivityError(await responseError(response, '发表评论失败'));
      }
    } catch {
      setActivityError('网络错误，请稍后重试');
    } finally {
      setCommenting(false);
    }
  };

  const handleEditComment = async (activityId: string, nextComment: string) => {
    setActivityError('');
    try {
      const response = await fetch(
        `/api/cases/${caseId}/activities/${activityId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: nextComment }),
        },
      );
      if (!response.ok) {
        setActivityError(await responseError(response, '编辑评论失败'));
        return false;
      }

      const data = await response.json() as { activity: CaseActivityDTO };
      setActivities((current) =>
        current.map((activity) =>
          activity.id === activityId ? data.activity : activity,
        ),
      );
      return true;
    } catch {
      setActivityError('网络错误，请稍后重试');
      return false;
    }
  };

  const handleDeleteComment = async (activityId: string) => {
    setActivityError('');
    try {
      const response = await fetch(
        `/api/cases/${caseId}/activities/${activityId}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        setActivityError(await responseError(response, '删除评论失败'));
        return false;
      }

      setActivities((current) =>
        current.filter((activity) => activity.id !== activityId),
      );
      return true;
    } catch {
      setActivityError('网络错误，请稍后重试');
      return false;
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

  const toggleWatch = async () => {
    if (watchBusy) return;
    setWatchBusy(true);
    setActivityError('');
    try {
      const response = await fetch(`/api/cases/${caseId}/watch`, {
        method: watching ? 'DELETE' : 'POST',
      });
      if (!response.ok) {
        setActivityError(await responseError(response, '更新关注状态失败'));
        return;
      }
      const data = await response.json() as { watching: boolean };
      setWatching(data.watching);
    } catch {
      setActivityError('网络错误，请稍后重试');
    } finally {
      setWatchBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <PageContainer title="用例明细">
        <div className="flex items-center justify-center py-12">
          <div className="text-text-secondary text-sm">加载中…</div>
        </div>
      </PageContainer>
    );
  }

  if (error || !caseData) {
    return (
      <PageContainer title="用例明细">
        <div className="flex flex-col items-center justify-center py-12 gap-2">
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
    <PageContainer
      title="用例明细"
      subtitle={caseData.caseNo}
      actions={
        <button
          type="button"
          onClick={() => void toggleWatch()}
          disabled={watchBusy}
          aria-pressed={watching}
          className={`h-10 rounded-[10px] border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            watching
              ? 'border-accent/25 bg-accent/10 text-accent'
              : 'border-border bg-surface-solid text-text-secondary hover:text-text-primary'
          }`}
        >
          {watchBusy ? '处理中…' : watching ? '已关注' : '关注用例'}
        </button>
      }
    >
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

      <ActivityTimeline
        activities={activities}
        canComment={canComment}
        comment={comment}
        commenting={commenting}
        error={activityError}
        onCommentChange={setComment}
        onSubmitComment={handleComment}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        mentionUsernames={members.map((member) => member.username)}
      />
    </PageContainer>
  );
}
