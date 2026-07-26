'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@/components/layout/PageContainer';
import { RootCauseManager } from '@/components/root-causes/RootCauseManager';
import { ArrowLeft } from '@phosphor-icons/react';

export default function ProjectRootCausesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';

  return (
    <PageContainer title="项目根因分类" subtitle="维护项目专属的标准化根因">
      <div className="mb-4">
        <Link href={`/projects/${projectId}`} className="text-sm text-accent">
          <span className="inline-flex items-center gap-1.5">
            <ArrowLeft size={15} aria-hidden="true" />
            返回项目详情
          </span>
        </Link>
      </div>
      {projectId && <RootCauseManager projectId={projectId} />}
    </PageContainer>
  );
}
