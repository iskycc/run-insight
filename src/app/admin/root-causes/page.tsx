'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { RootCauseManager } from '@/components/root-causes/RootCauseManager';
import { useAuth } from '@/components/shared/AuthProvider';

export default function GlobalRootCausesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, router, user]);

  if (isLoading || user?.role !== 'ADMIN') return null;
  return (
    <PageContainer title="根因分类" subtitle="维护所有项目可复用的全局分类">
      <RootCauseManager />
    </PageContainer>
  );
}
