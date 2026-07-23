'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { CaseDetail, type CaseDetailData } from '@/components/case/CaseDetail';
import { EditAnalysisModal } from '@/components/case/EditAnalysisModal';
import { SaveAssetModal } from '@/components/shared/SaveAssetModal';
import { useAuth } from '@/components/shared/AuthProvider';

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [caseData, setCaseData] = useState<CaseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saveAssetOpen, setSaveAssetOpen] = useState(false);

  const caseId = params.id as string;

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

  const handleSaveAnalysis = async (data: {
    assignee: string;
    progressCategory: string;
    rootCause: string;
    mrOrTicket: string;
  }) => {
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditOpen(false);
        await fetchCase();
      }
    } catch {
      // 静默处理，保持弹窗打开让用户重试
    }
  };

  const handleSaveAsset = async (id: string) => {
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
        caseData={caseData}
        onEdit={() => setEditOpen(true)}
        onSaveAsset={() => setSaveAssetOpen(true)}
      />

      <EditAnalysisModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveAnalysis}
        initialData={{
          assignee: caseData.assignee ?? '',
          progressCategory: caseData.progressCategory ?? '',
          rootCause: caseData.rootCause ?? '',
          mrOrTicket: caseData.mrOrTicket ?? '',
        }}
      />

      <SaveAssetModal
        open={saveAssetOpen}
        onClose={() => setSaveAssetOpen(false)}
        onConfirm={handleSaveAsset}
        caseData={caseData}
      />
    </PageContainer>
  );
}
