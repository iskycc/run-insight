'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Select } from '@/components/shared/Select';
import {
  PROGRESS_CATEGORIES,
  PROGRESS_LABELS,
  type CasePriority,
  type ProgressCategory,
  type ProjectMemberDTO,
  type RootCauseCategoryDTO,
} from '@/types';

type EditAnalysisData = {
  assignee: string;
  assigneeId?: string | null;
  priority?: CasePriority | null;
  dueDate?: string | null;
  progressCategory: string;
  rootCause: string;
  rootCauseCategoryId?: string | null;
  mrOrTicket: string;
  notes: string;
};

type EditAnalysisModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: EditAnalysisData) => void;
  initialData: EditAnalysisData;
  members?: ProjectMemberDTO[];
  rootCauseCategories?: RootCauseCategoryDTO[];
};

const progressOptions = PROGRESS_CATEGORIES.map((cat) => ({
  value: cat,
  label: PROGRESS_LABELS[cat],
}));

export type { EditAnalysisData };

export function EditAnalysisModal({
  open,
  onClose,
  onSave,
  initialData,
  members,
  rootCauseCategories = [],
}: EditAnalysisModalProps) {
  const [assignee, setAssignee] = useState(initialData.assignee);
  const [assigneeId, setAssigneeId] = useState(initialData.assigneeId ?? '');
  const [priority, setPriority] = useState(initialData.priority ?? '');
  const [dueDate, setDueDate] = useState(initialData.dueDate?.slice(0, 10) ?? '');
  const [progressCategory, setProgressCategory] = useState(initialData.progressCategory);
  const [rootCause, setRootCause] = useState(initialData.rootCause);
  const [rootCauseCategoryId, setRootCauseCategoryId] = useState(initialData.rootCauseCategoryId ?? '');
  const [mrOrTicket, setMrOrTicket] = useState(initialData.mrOrTicket);
  const [notes, setNotes] = useState(initialData.notes);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        assignee,
        ...(members ? {
          assigneeId: assigneeId || null,
          priority: (priority as CasePriority) || null,
          dueDate: dueDate || null,
        } : {}),
        progressCategory,
        rootCause,
        rootCauseCategoryId: rootCauseCategoryId || null,
        mrOrTicket,
        notes,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 当 initialData 变化时重新同步（用例数据刷新后）
  const resetForm = () => {
    setAssignee(initialData.assignee);
    setAssigneeId(initialData.assigneeId ?? '');
    setPriority(initialData.priority ?? '');
    setDueDate(initialData.dueDate?.slice(0, 10) ?? '');
    setProgressCategory(initialData.progressCategory);
    setRootCause(initialData.rootCause);
    setRootCauseCategoryId(initialData.rootCauseCategoryId ?? '');
    setMrOrTicket(initialData.mrOrTicket);
    setNotes(initialData.notes);
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
      <form id="edit-analysis-form" onSubmit={handleSubmit} className="space-y-4">
        {members ? (
          <Select
            label="分析责任人"
            value={assigneeId}
            onChange={(event) => {
              setAssigneeId(event.target.value);
              setAssignee(members.find((member) => member.userId === event.target.value)?.username ?? '');
            }}
            placeholder={initialData.assignee && !initialData.assigneeId
              ? `未关联：${initialData.assignee}`
              : '未分配'}
            options={members.map((member) => ({
              value: member.userId,
              label: member.username,
            }))}
          />
        ) : (
          <Input
            label="分析责任人"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="输入责任人"
          />
        )}

        {members && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="优先级"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              placeholder="未设置"
              options={[
                { value: 'HIGH', label: '高' },
                { value: 'MEDIUM', label: '中' },
                { value: 'LOW', label: '低' },
              ]}
            />
            <Input
              label="截止日期"
              type="text"
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              pattern="\d{4}-\d{2}-\d{2}"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        )}

        <Select
          label="进展分类"
          options={progressOptions}
          value={progressCategory}
          onChange={(e) => setProgressCategory(e.target.value as ProgressCategory)}
          placeholder="选择进展分类"
        />

        <Select
          label="根因分类"
          value={rootCauseCategoryId}
          onChange={(event) => setRootCauseCategoryId(event.target.value)}
          placeholder="未分类"
          options={rootCauseCategories.map((category) => ({
            value: category.id,
            label: `${category.projectId ? '' : '全局 · '}${category.name}`,
          }))}
        />

        <Input
          label="根因补充"
          value={rootCause}
          onChange={(e) => setRootCause(e.target.value)}
          placeholder="补充具体原因（可选）"
        />

        <Input
          label="MR 链接 / 单号"
          value={mrOrTicket}
          onChange={(e) => setMrOrTicket(e.target.value)}
          placeholder="输入 MR 链接或工单号"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="analysis-notes" className="text-sm font-medium text-text-primary">
            备注
          </label>
          <textarea
            id="analysis-notes"
            value={notes}
            maxLength={5000}
            rows={5}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="补充分析过程、结论或处理说明"
            className="field-control w-full resize-y px-3 py-2 text-sm"
          />
          <span className="text-right text-xs text-text-secondary">{notes.length}/5000</span>
        </div>
      </form>
    </Modal>
  );
}
