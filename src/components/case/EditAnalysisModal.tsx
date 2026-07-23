'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Select } from '@/components/shared/Select';
import { PROGRESS_CATEGORIES, PROGRESS_LABELS, type ProgressCategory } from '@/types';

type EditAnalysisData = {
  assignee: string;
  progressCategory: string;
  rootCause: string;
  mrOrTicket: string;
};

type EditAnalysisModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: EditAnalysisData) => void;
  initialData: EditAnalysisData;
};

const progressOptions = PROGRESS_CATEGORIES.map((cat) => ({
  value: cat,
  label: PROGRESS_LABELS[cat],
}));

export type { EditAnalysisData };

export function EditAnalysisModal({ open, onClose, onSave, initialData }: EditAnalysisModalProps) {
  const [assignee, setAssignee] = useState(initialData.assignee);
  const [progressCategory, setProgressCategory] = useState(initialData.progressCategory);
  const [rootCause, setRootCause] = useState(initialData.rootCause);
  const [mrOrTicket, setMrOrTicket] = useState(initialData.mrOrTicket);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      onSave({ assignee, progressCategory, rootCause, mrOrTicket });
    } finally {
      setIsSaving(false);
    }
  };

  // 当 initialData 变化时重新同步（用例数据刷新后）
  const resetForm = () => {
    setAssignee(initialData.assignee);
    setProgressCategory(initialData.progressCategory);
    setRootCause(initialData.rootCause);
    setMrOrTicket(initialData.mrOrTicket);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="编辑分析信息"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              resetForm();
              onClose();
            }}
          >
            取消
          </Button>
          <Button type="submit" form="edit-analysis-form" disabled={isSaving}>
            保存
          </Button>
        </>
      }
    >
      <form id="edit-analysis-form" onSubmit={handleSubmit} className="space-y-md">
        <Input
          label="分析责任人"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="输入责任人"
        />

        <Select
          label="进展分类"
          options={progressOptions}
          value={progressCategory}
          onChange={(e) => setProgressCategory(e.target.value as ProgressCategory)}
          placeholder="选择进展分类"
        />

        <Input
          label="问题根因"
          value={rootCause}
          onChange={(e) => setRootCause(e.target.value)}
          placeholder="输入问题根因"
        />

        <Input
          label="MR 链接 / 单号"
          value={mrOrTicket}
          onChange={(e) => setMrOrTicket(e.target.value)}
          placeholder="输入 MR 链接或工单号"
        />
      </form>
    </Modal>
  );
}
