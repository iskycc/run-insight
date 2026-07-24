'use client';

import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { PROGRESS_LABELS, type ProgressCategory } from '@/types';

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
  progressCategory: string | null;
  rootCause: string | null;
  mrOrTicket: string | null;
  assetSaved: boolean;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string };
  stage: { id: string; name: string };
  batchScope: { id: string; name: string };
};

type CaseDetailProps = {
  caseData: CaseDetailData;
  onEdit: () => void;
  onSaveAsset: () => void;
};

const PROGRESS_BADGE_MAP: Record<string, 'pending' | 'analyzing' | 'located' | 'fixed' | 'not-issue' | 'blocked'> = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  LOCATED: 'located',
  FIXED: 'fixed',
  NOT_ISSUE: 'not-issue',
  BLOCKED: 'blocked',
};

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  );
}

export function CaseDetail({ caseData, onEdit, onSaveAsset }: CaseDetailProps) {
  const progressKey = caseData.progressCategory
    ? PROGRESS_BADGE_MAP[caseData.progressCategory]
    : undefined;
  const progressLabel = caseData.progressCategory
    ? PROGRESS_LABELS[caseData.progressCategory as ProgressCategory] ?? caseData.progressCategory
    : null;

  return (
    <div className="space-y-lg">
      {/* 顶部操作栏 */}
      <div className="panel flex flex-wrap items-center justify-between gap-sm p-4">
        <div className="flex min-w-0 items-center gap-sm">
          <span className="font-mono text-sm text-text-secondary">{caseData.caseNo}</span>
          <h1 className="truncate text-xl font-semibold text-text-primary">{caseData.name}</h1>
        </div>
        <div className="flex items-center gap-sm">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            编辑分析
          </Button>
          {caseData.assetSaved ? (
            <span className="inline-flex items-center px-sm py-xs text-xs font-medium rounded-md bg-success/15 text-success">
              已保存资产
            </span>
          ) : (
            <Button size="sm" onClick={onSaveAsset}>
              保存为资产
            </Button>
          )}
        </div>
      </div>

      {/* 基本信息 */}
      <div className="panel p-lg">
        <h2 className="text-sm font-semibold text-text-primary mb-md">基本信息</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          <InfoRow label="编号">{caseData.caseNo}</InfoRow>
          <InfoRow label="名称">{caseData.name}</InfoRow>
          <InfoRow label="结果概要">
            <span className={`inline-flex items-center px-sm py-xs text-xs font-medium rounded-md ${
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
            {caseData.logUrl ? (
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
      <div className="panel p-lg">
        <h2 className="text-sm font-semibold text-text-primary mb-md">分析信息</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          <InfoRow label="分析责任人">
            {caseData.assignee ?? <span className="text-text-secondary">—</span>}
          </InfoRow>
          <InfoRow label="进展分类">
            {progressKey && progressLabel ? (
              <Badge progress={progressKey}>{progressLabel}</Badge>
            ) : (
              <span className="text-text-secondary">—</span>
            )}
          </InfoRow>
          <InfoRow label="问题根因">
            {caseData.rootCause ?? <span className="text-text-secondary">—</span>}
          </InfoRow>
          <InfoRow label="MR 链接 / 单号">
            {caseData.mrOrTicket ? (
              caseData.mrOrTicket.startsWith('http') ? (
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
        </div>
      </div>

      {/* 所属维度 */}
      <div className="panel p-lg">
        <h2 className="text-sm font-semibold text-text-primary mb-md">所属维度</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
          <InfoRow label="项目">{caseData.project.name}</InfoRow>
          <InfoRow label="测试阶段">{caseData.stage.name}</InfoRow>
          <InfoRow label="批跑范围">{caseData.batchScope.name}</InfoRow>
        </div>
      </div>

      {/* 时间戳 */}
      <div className="flex flex-wrap gap-md text-xs text-text-secondary">
        <span>创建于 {new Date(caseData.createdAt).toLocaleString('zh-CN')}</span>
        <span>更新于 {new Date(caseData.updatedAt).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  );
}
