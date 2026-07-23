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
      <div className="card-solid overflow-hidden hidden md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-md py-sm text-xs font-medium text-text-secondary uppercase tracking-wide">编号</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary uppercase tracking-wide">名称</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary uppercase tracking-wide">项目</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary uppercase tracking-wide">阶段</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary uppercase tracking-wide">进展</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary uppercase tracking-wide">根因</th>
              <th className="px-md py-sm text-xs font-medium text-text-secondary uppercase tracking-wide">责任人</th>
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
                  className="border-b border-border last:border-0 hover:bg-bg/50 cursor-pointer transition-colors"
                >
                  <td className="px-md py-sm text-sm font-mono text-text-secondary">{asset.caseNo}</td>
                  <td className="px-md py-sm text-sm text-text-primary">{asset.name}</td>
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
              className="card-solid p-md cursor-pointer hover:shadow-md transition-shadow"
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
            className="px-sm py-xs text-sm rounded-md border border-border text-text-secondary
                       hover:bg-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <span className="text-sm text-text-secondary">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-sm py-xs text-sm rounded-md border border-border text-text-secondary
                       hover:bg-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
