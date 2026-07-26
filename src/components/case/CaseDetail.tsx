'use client';

import { useState } from 'react';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { formatDate, formatDateTime } from '@/lib/date-time';
import { isSafeHttpUrl } from '@/lib/url';
import { getProgressBadgeKey, getProgressLabel } from '@/lib/progress';

export type CaseDetailData = {
  id: string;
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string | null;
  projectId: string;
  testStageId: string;
  batchScopeId: string;
  assignee: string | null;
  assigneeId?: string | null;
  assigneeUsername?: string | null;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  dueDate?: string | null;
  progressCategory: string | null;
  rootCause: string | null;
  rootCauseCategoryId?: string | null;
  rootCauseCategory?: { id: string; name: string } | null;
  mrOrTicket: string | null;
  notes: string | null;
  assetSaved: boolean;
  updatedBy: string | null;
  updatedByUsername?: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string };
  stage: { id: string; name: string };
  batchScope: { id: string; name: string };
};

type CaseDetailProps = {
  canEdit: boolean;
  caseData: CaseDetailData;
  onEdit: () => void;
  onSaveAsset: () => void;
};

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  );
}

export function CaseDetail({ canEdit, caseData, onEdit, onSaveAsset }: CaseDetailProps) {
  const progressKey = getProgressBadgeKey(caseData.progressCategory) ?? undefined;
  const progressLabel = getProgressLabel(caseData.progressCategory) ?? caseData.progressCategory;
  const [renderedAt] = useState(() => Date.now());

  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="panel flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm text-text-secondary">{caseData.caseNo}</span>
          <h1 className="truncate text-xl font-semibold text-text-primary">{caseData.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              编辑分析
            </Button>
          )}
          {canEdit ? (
            <Button size="sm" onClick={onSaveAsset}>
              {caseData.assetSaved ? '更新资产快照' : '保存为资产'}
            </Button>
          ) : caseData.assetSaved ? (
            <span className="inline-flex items-center rounded-md bg-success/15 px-2 py-1 text-xs font-medium text-success">
              已保存资产
            </span>
          ) : null}
        </div>
      </div>

      {/* 基本信息 */}
      <div className="panel p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4">基本信息</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoRow label="编号">{caseData.caseNo}</InfoRow>
          <InfoRow label="名称">{caseData.name}</InfoRow>
          <InfoRow label="结果概要">
            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${
              caseData.resultSummary === 'PASS'
                ? 'bg-success/15 text-success'
                : caseData.resultSummary === 'FAIL'
                ? 'bg-danger/15 text-danger'
                : caseData.resultSummary === 'BLOCK'
                ? 'bg-progress-blocked/15 text-progress-blocked'
                : 'bg-bg text-text-secondary'
            }`}>
              {caseData.resultSummary}
            </span>
          </InfoRow>
          <InfoRow label="执行日志">
            {caseData.logUrl && isSafeHttpUrl(caseData.logUrl) ? (
              <a
                href={caseData.logUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-hover underline"
              >
                查看执行日志
              </a>
            ) : (
              <span className="text-text-secondary">—</span>
            )}
          </InfoRow>
        </div>
      </div>

      {/* 分析信息 */}
      <div className="panel p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4">分析信息</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoRow label="分析责任人">
            {caseData.assigneeUsername ?? caseData.assignee ?? <span className="text-text-secondary">—</span>}
          </InfoRow>
          <InfoRow label="优先级">
            {caseData.priority
              ? ({ HIGH: '高', MEDIUM: '中', LOW: '低' } as const)[caseData.priority]
              : <span className="text-text-secondary">—</span>}
          </InfoRow>
          <InfoRow label="截止日期">
            {caseData.dueDate
              ? <span className={new Date(caseData.dueDate).getTime() < renderedAt ? 'text-danger' : ''}>
                  {formatDate(caseData.dueDate)}
                </span>
              : <span className="text-text-secondary">—</span>}
          </InfoRow>
          <InfoRow label="进展分类">
            {progressKey && progressLabel ? (
              <Badge progress={progressKey}>{progressLabel}</Badge>
            ) : (
              <span className="text-text-secondary">—</span>
            )}
          </InfoRow>
          <InfoRow label="根因分类">
            {caseData.rootCauseCategory?.name ?? <span className="text-text-secondary">—</span>}
          </InfoRow>
          <InfoRow label="根因补充">
            {caseData.rootCause ?? <span className="text-text-secondary">—</span>}
          </InfoRow>
          <InfoRow label="MR 链接 / 单号">
            {caseData.mrOrTicket ? (
              isSafeHttpUrl(caseData.mrOrTicket) ? (
                <a
                  href={caseData.mrOrTicket}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-accent underline hover:text-accent-hover"
                >
                  {caseData.mrOrTicket}
                </a>
              ) : (
                <span>{caseData.mrOrTicket}</span>
              )
            ) : (
              <span className="text-text-secondary">—</span>
            )}
          </InfoRow>
          <InfoRow label="备注">
            {caseData.notes ? (
              <span className="whitespace-pre-wrap break-words">{caseData.notes}</span>
            ) : (
              <span className="text-text-secondary">—</span>
            )}
          </InfoRow>
        </div>
      </div>

      {/* 所属维度 */}
      <div className="panel p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4">所属维度</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InfoRow label="项目">{caseData.project.name}</InfoRow>
          <InfoRow label="测试阶段">{caseData.stage.name}</InfoRow>
          <InfoRow label="批跑范围">{caseData.batchScope.name}</InfoRow>
        </div>
      </div>

      {/* 时间戳 */}
      <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
        <span>创建于 {formatDateTime(caseData.createdAt)}</span>
        <span>更新于 {formatDateTime(caseData.updatedAt)}</span>
        <span>最近更新人 {caseData.updatedByUsername ?? '—'}</span>
      </div>
    </div>
  );
}
