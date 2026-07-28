'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { Select } from '@/components/shared/Select';
import { Textarea } from '@/components/shared/Textarea';
import {
  PROGRESS_CATEGORIES,
  PROGRESS_LABELS,
  type CaseResultDTO,
  type ProgressCategory,
  type ResultSummary,
  type UpdateCaseRequest,
} from '@/types';

type BatchResultEditModalProps = {
  caseData: CaseResultDTO;
  open: boolean;
  onClose: () => void;
  onSave: (updates: UpdateCaseRequest) => Promise<void>;
};

export function BatchResultEditModal({
  caseData,
  open,
  onClose,
  onSave,
}: BatchResultEditModalProps) {
  const [name, setName] = useState(caseData.name);
  const [resultSummary, setResultSummary] = useState<ResultSummary>(
    caseData.resultSummary as ResultSummary,
  );
  const [logUrl, setLogUrl] = useState(caseData.logUrl ?? '');
  const [assignee, setAssignee] = useState(caseData.assignee ?? '');
  const [progressCategory, setProgressCategory] = useState(
    caseData.progressCategory ?? '',
  );
  const [rootCause, setRootCause] = useState(caseData.rootCause ?? '');
  const [mrOrTicket, setMrOrTicket] = useState(caseData.mrOrTicket ?? '');
  const [notes, setNotes] = useState(caseData.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('用例名称不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        resultSummary,
        logUrl: logUrl.trim() || null,
        assignee: assignee.trim(),
        progressCategory: progressCategory
          ? progressCategory as ProgressCategory
          : null,
        rootCause: rootCause.trim(),
        mrOrTicket: mrOrTicket.trim(),
        notes,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`编辑结果 · ${caseData.caseNo}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            type="submit"
            form="batch-result-edit-form"
            loading={saving}
            loadingLabel="保存中…"
          >
            保存修改
          </Button>
        </>
      )}
    >
      <form id="batch-result-edit-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl bg-danger/8 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Input
          label="用例名称"
          value={name}
          maxLength={191}
          required
          onChange={(event) => setName(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="执行结果"
            value={resultSummary}
            onValueChange={(value) => setResultSummary(value as ResultSummary)}
            options={[
              { value: 'PASS', label: 'PASS · 通过' },
              { value: 'FAIL', label: 'FAIL · 失败' },
              { value: 'BLOCK', label: 'BLOCK · 阻塞' },
              { value: 'SKIP', label: 'SKIP · 跳过' },
            ]}
          />
          <Select
            label="分析进展"
            value={progressCategory}
            placeholder="未设置"
            onValueChange={setProgressCategory}
            options={PROGRESS_CATEGORIES.map((category) => ({
              value: category,
              label: PROGRESS_LABELS[category],
            }))}
          />
        </div>
        <Input
          label="日志链接"
          type="url"
          value={logUrl}
          placeholder="https://"
          onChange={(event) => setLogUrl(event.target.value)}
        />
        <Input
          label="责任人"
          value={assignee}
          maxLength={191}
          placeholder="未分配"
          onChange={(event) => setAssignee(event.target.value)}
        />
        <Input
          label="根因"
          value={rootCause}
          maxLength={200}
          placeholder="可选"
          onChange={(event) => setRootCause(event.target.value)}
        />
        <Input
          label="MR / 工单"
          value={mrOrTicket}
          maxLength={200}
          placeholder="可选"
          onChange={(event) => setMrOrTicket(event.target.value)}
        />
        <Textarea
          id="batch-result-notes"
          label="备注"
          value={notes}
          maxLength={5000}
          rows={4}
          onChange={(event) => setNotes(event.target.value)}
        />
      </form>
    </Modal>
  );
}
