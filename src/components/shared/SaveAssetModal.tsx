'use client';

import { Modal } from './Modal';
import { Badge } from './Badge';
import { Button } from './Button';
import type { CaseResultDTO } from '@/types';

type SaveAssetModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (caseId: string) => void;
  caseData: CaseResultDTO;
};

const PROGRESS_MAP: Record<string, 'pending' | 'analyzing' | 'located' | 'fixed' | 'not-issue' | 'blocked'> = {
  'PENDING': 'pending',
  'ANALYZING': 'analyzing',
  'LOCATED': 'located',
  'FIXED': 'fixed',
  'NOT_ISSUE': 'not-issue',
  'BLOCKED': 'blocked',
  '待分析': 'pending',
  '分析中': 'analyzing',
  '已定位': 'located',
  '已修复': 'fixed',
  '非问题': 'not-issue',
  '阻塞': 'blocked',
};

export function SaveAssetModal({ open, onClose, onConfirm, caseData }: SaveAssetModalProps) {
  const hasProgress = !!caseData.progressCategory;
  const progressKey = caseData.progressCategory
    ? PROGRESS_MAP[caseData.progressCategory]
    : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="保存为资产"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => onConfirm(caseData.id)}
            disabled={!hasProgress}
          >
            确认保存
          </Button>
        </>
      }
    >
      {/* Case info */}
      <div className="space-y-sm">
        <div className="flex min-w-0 items-center gap-sm">
          <span className="text-sm font-mono text-text-secondary">{caseData.caseNo}</span>
          <span className="truncate text-sm font-medium text-text-primary">{caseData.name}</span>
        </div>

        <div className="grid grid-cols-1 gap-sm text-sm sm:grid-cols-2">
          <div>
            <span className="text-text-secondary">结果概要：</span>
            <span className="text-text-primary">{caseData.resultSummary}</span>
          </div>

          {caseData.assignee && (
            <div>
              <span className="text-text-secondary">分析人：</span>
              <span className="text-text-primary">{caseData.assignee}</span>
            </div>
          )}

          <div className="min-w-0">
            <span className="text-text-secondary">进展：</span>
            {progressKey ? (
              <Badge progress={progressKey}>{caseData.progressCategory}</Badge>
            ) : (
              <span className="text-text-secondary">—</span>
            )}
          </div>

          {caseData.rootCause && (
            <div className="min-w-0">
              <span className="text-text-secondary">根因：</span>
              <span className="text-text-primary">{caseData.rootCause}</span>
            </div>
          )}

          {caseData.mrOrTicket && (
            <div className="min-w-0 sm:col-span-2">
              <span className="text-text-secondary">MR / 单号：</span>
              <span className="break-all text-accent">{caseData.mrOrTicket}</span>
            </div>
          )}
        </div>

        {/* Warning when not analyzed */}
        {!hasProgress && (
          <div className="mt-sm rounded-md bg-warning/10 px-sm py-sm text-sm text-warning">
            该用例尚未完成分析，无法保存为资产。请先填写进展分类。
          </div>
        )}
      </div>
    </Modal>
  );
}
