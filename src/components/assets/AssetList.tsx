'use client';

import { Badge } from '@/components/shared/Badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { PROGRESS_LABELS, type ProgressCategory } from '@/types';

export type AssetItem = {
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

type AssetListProps = {
  assets: AssetItem[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSelect: (id: string) => void;
};

const PROGRESS_BADGE_MAP: Record<string, 'pending' | 'analyzing' | 'located' | 'fixed' | 'not-issue' | 'blocked'> = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  LOCATED: 'located',
  FIXED: 'fixed',
  NOT_ISSUE: 'not-issue',
  BLOCKED: 'blocked',
};

export function AssetList({ assets, total, page, pageSize, onPageChange, onSelect }: AssetListProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (assets.length === 0) {
    return (
      <EmptyState
        title="暂无资产数据"
        description="保存分析后的用例即可在资产库中查看"
      />
    );
  }

  return (
    <div>
      {/* 桌面端表格 */}
      <div className="panel hidden overflow-hidden md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-bg/70 text-left">
              <th className="px-md py-sm text-xs font-medium text-text-secondary">编号</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary">名称</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary">项目</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary">阶段</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary">进展</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary">根因</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary">责任人</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const progressKey = asset.progressCategory
                ? PROGRESS_BADGE_MAP[asset.progressCategory]
                : undefined;
              const progressLabel = asset.progressCategory
                ? PROGRESS_LABELS[asset.progressCategory as ProgressCategory] ?? asset.progressCategory
                : null;
              return (
                <tr
                  key={asset.id}
                  onClick={() => onSelect(asset.id)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-bg/70"
                >
                  <td className="px-md py-sm font-mono text-xs font-medium text-accent">{asset.caseNo}</td>
                  <td className="px-md py-sm text-sm font-medium text-text-primary">{asset.name}</td>
                  <td className="px-md py-sm text-sm text-text-secondary">{asset.project.name}</td>
                  <td className="px-md py-sm text-sm text-text-secondary">{asset.stage.name}</td>
                  <td className="px-md py-sm">
                    {progressKey && progressLabel ? (
                      <Badge progress={progressKey}>{progressLabel}</Badge>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-md py-sm text-sm text-text-primary max-w-[200px] truncate">
                    {asset.rootCause ?? <span className="text-text-secondary">—</span>}
                  </td>
                  <td className="px-md py-sm text-sm text-text-secondary">{asset.assignee ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 移动端卡片 */}
      <div className="md:hidden space-y-sm">
        {assets.map((asset) => {
          const progressKey = asset.progressCategory
            ? PROGRESS_BADGE_MAP[asset.progressCategory]
            : undefined;
          const progressLabel = asset.progressCategory
            ? PROGRESS_LABELS[asset.progressCategory as ProgressCategory] ?? asset.progressCategory
            : null;
          return (
            <div
              key={asset.id}
              onClick={() => onSelect(asset.id)}
              className="panel cursor-pointer p-md transition hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-xs">
                <span className="font-mono text-xs text-text-secondary">{asset.caseNo}</span>
                {progressKey && progressLabel ? (
                  <Badge progress={progressKey}>{progressLabel}</Badge>
                ) : null}
              </div>
              <div className="text-sm font-medium text-text-primary mb-xs">{asset.name}</div>
              <div className="text-xs text-text-secondary">
                {asset.project.name} · {asset.stage.name} · {asset.assignee ?? '未分配'}
              </div>
              {asset.rootCause && (
                <div className="text-xs text-text-secondary mt-xs">根因：{asset.rootCause}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-sm mt-lg">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-border bg-surface-solid px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm text-text-secondary">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-border bg-surface-solid px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
