'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@/components/layout/PageContainer';
import { RootCauseManager } from '@/components/root-causes/RootCauseManager';

export default function ProjectRootCausesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  return (
    <PageContainer title="项目根因分类" subtitle="维护项目专属的标准化根因">
      <div className="mb-md">
        <Link href={`/projects/${projectId}`} className="text-sm text-accent">
          ← 返回项目详情
        </Link>
      </div>
      {projectId && <RootCauseManager projectId={projectId} />}
    </PageContainer>
  );
}
