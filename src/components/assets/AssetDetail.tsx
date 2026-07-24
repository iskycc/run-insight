'use client';

import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { PROGRESS_LABELS, type ProgressCategory } from '@/types';
import type { AssetItem } from './AssetList';

type AssetDetailProps = {
  asset: AssetItem;
  onClose: () => void;
};

const PROGRESS_BADGE_MAP: Record<string, 'pending' | 'analyzing' | 'located' | 'fixed' | 'not-issue' | 'blocked'> = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  LOCATED: 'located',
  FIXED: 'fixed',
  NOT_ISSUE: 'not-issue',
  BLOCKED: 'blocked',
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  );
}

export function AssetDetail({ asset, onClose }: AssetDetailProps) {
  const progressKey = asset.progressCategory
    ? PROGRESS_BADGE_MAP[asset.progressCategory]
    : undefined;
  const progressLabel = asset.progressCategory
    ? PROGRESS_LABELS[asset.progressCategory as ProgressCategory] ?? asset.progressCategory
    : null;

  return (
    <div className="panel space-y-lg p-lg">
      {/* 顶部关闭 */}
      <div className="flex items-center justify-between flex-wrap gap-sm">
        <div className="flex items-center gap-sm">
          <span className="font-mono text-sm text-text-secondary">{asset.caseNo}</span>
          <h2 className="text-lg font-semibold text-text-primary">{asset.name}</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          关闭
        </Button>
      </div>

      {/* 完整分析链路 */}
      <div className="panel-muted p-md">
        <h3 className="mb-md text-xs font-semibold text-text-secondary">
          分析链路
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
          <DetailRow label="结果概要">
            <span className={`inline-flex items-center px-sm py-xs text-xs font-medium rounded-md ${
              asset.resultSummary === 'PASS' ? 'bg-success/15 text-success'
                : asset.resultSummary === 'FAIL' ? 'bg-danger/15 text-danger'
                : 'bg-bg text-text-secondary'
            }`}>
              {asset.resultSummary}
            </span>
          </DetailRow>

          <DetailRow label="进展分类">
            {progressKey && progressLabel ? (
              <Badge progress={progressKey}>{progressLabel}</Badge>
            ) : (
              <span className="text-text-secondary">—</span>
            )}
          </DetailRow>

          <DetailRow label="分析责任人">
            {asset.assignee ?? <span className="text-text-secondary">—</span>}
          </DetailRow>

          <DetailRow label="问题根因">
            {asset.rootCause ?? <span className="text-text-secondary">—</span>}
          </DetailRow>

          <DetailRow label="MR 链接 / 单号">
            {asset.mrOrTicket ? (
              asset.mrOrTicket.startsWith('http') ? (
              <a
                href={asset.mrOrTicket}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-accent underline hover:text-accent-hover"
                >
                  {asset.mrOrTicket}
                </a>
              ) : (
                <span>{asset.mrOrTicket}</span>
              )
            ) : (
              <span className="text-text-secondary">—</span>
            )}
          </DetailRow>

          <DetailRow label="执行日志">
            {asset.logUrl ? (
              <a
                href={asset.logUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline hover:text-accent-hover"
              >
                查看执行日志
              </a>
            ) : (
              <span className="text-text-secondary">无</span>
            )}
          </DetailRow>
        </div>
      </div>

      {/* 所属维度 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
        <DetailRow label="项目">{asset.project.name}</DetailRow>
        <DetailRow label="测试阶段">{asset.stage.name}</DetailRow>
        <DetailRow label="批跑范围">{asset.batchScope.name}</DetailRow>
      </div>

      {/* 时间 */}
      <div className="flex flex-wrap gap-md text-xs text-text-secondary">
        <span>创建于 {new Date(asset.createdAt).toLocaleString('zh-CN')}</span>
        <span>更新于 {new Date(asset.updatedAt).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  );
}
