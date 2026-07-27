'use client';

import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Select } from './Select';
import { PROGRESS_CATEGORIES, PROGRESS_LABELS, type ProgressCategory } from '@/types';

export type BatchActionType = 'progressCategory' | 'assetSaved' | 'assignee';

interface BatchActionModalProps {
  open: boolean;
  action: BatchActionType;
  selectedCount: number;
  onClose: () => void;
  onConfirm: (updates: BatchUpdates) => Promise<void> | void;
}

export interface BatchUpdates {
  progressCategory?: ProgressCategory;
  assetSaved?: boolean;
  assignee?: string;
}

const ACTION_LABELS: Record<BatchActionType, string> = {
  progressCategory: '批量更新进展',
  assetSaved: '批量保存资产',
  assignee: '批量指派责任人',
};

const ACTION_DESCRIPTIONS: Record<BatchActionType, string> = {
  progressCategory: '将该进展分类应用到所有选中的用例',
  assetSaved: '将选中的用例批量标记为资产',
  assignee: '将该责任人批量指派给所有选中的用例',
};

export function BatchActionModal({
  open,
  action,
  selectedCount,
  onClose,
  onConfirm,
}: BatchActionModalProps) {
  const [progressCategory, setProgressCategory] = useState<ProgressCategory | ''>('');
  const [assetSaved, setAssetSaved] = useState<'true' | 'false'>('true');
  const [assignee, setAssignee] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (action === 'progressCategory') return progressCategory !== '';
    if (action === 'assetSaved') return true;
    if (action === 'assignee') return assignee.trim().length > 0;
    return false;
  }, [action, progressCategory, assignee]);

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      if (action === 'progressCategory' && progressCategory) {
        await onConfirm({ progressCategory });
      } else if (action === 'assetSaved') {
        await onConfirm({ assetSaved: assetSaved === 'true' });
      } else if (action === 'assignee') {
        await onConfirm({ assignee: assignee.trim() });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '批量更新失败';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ACTION_LABELS[action]}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || submitting}>
            {submitting ? '提交中…' : `确认 (${selectedCount})`}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        <p className="text-text-secondary">
          {ACTION_DESCRIPTIONS[action]}
        </p>
        <p className="text-text-primary">
          将影响 <span className="font-semibold">{selectedCount}</span> 个用例。
        </p>

        {action === 'progressCategory' && (
          <div>
            <Select
              id="batch-progress"
              label="进展分类"
              aria-label="进展分类"
              value={progressCategory}
              onChange={(e) => setProgressCategory(e.target.value as ProgressCategory | '')}
              placeholder="请选择进展分类"
              className="h-10"
              options={PROGRESS_CATEGORIES.map((progress) => ({
                value: progress,
                label: PROGRESS_LABELS[progress],
              }))}
            />
          </div>
        )}

        {action === 'assetSaved' && (
          <div>
            <Select
              id="batch-asset"
              label="资产状态"
              aria-label="资产状态"
              value={assetSaved}
              onChange={(e) => setAssetSaved(e.target.value as 'true' | 'false')}
              className="h-10"
              options={[
                { value: 'true', label: '标记为已保存' },
                { value: 'false', label: '标记为未保存' },
              ]}
            />
          </div>
        )}

        {action === 'assignee' && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="batch-assignee"
              className="text-xs font-semibold text-text-secondary"
            >
              责任人
            </label>
            <input
              id="batch-assignee"
              type="text"
              aria-label="责任人"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="请输入责任人"
              className="field-control h-10 w-full px-3 text-sm"
            />
          </div>
        )}

        {error && (
          <div className="rounded-md bg-danger/10 px-2 py-2 text-sm text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
