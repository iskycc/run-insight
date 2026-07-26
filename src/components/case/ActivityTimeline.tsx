'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { formatDateTime } from '@/lib/date-time';
import type { CaseActivityDTO } from '@/types';

type ActivityTimelineProps = {
  activities: CaseActivityDTO[];
  canComment: boolean;
  comment: string;
  commenting: boolean;
  error: string;
  onCommentChange: (comment: string) => void;
  onSubmitComment: () => void | Promise<void>;
  onEditComment: (activityId: string, comment: string) => Promise<boolean>;
  onDeleteComment: (activityId: string) => Promise<boolean>;
  mentionUsernames?: string[];
};

function activityLabel(type: CaseActivityDTO['type']) {
  if (type === 'COMMENT') return '发表了评论';
  if (type === 'CREATED') return '创建了用例';
  return '更新了分析信息';
}

export function ActivityTimeline({
  activities,
  canComment,
  comment,
  commenting,
  error,
  onCommentChange,
  onSubmitComment,
  onEditComment,
  onDeleteComment,
  mentionUsernames = [],
}: ActivityTimelineProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const mentionMatch = comment.match(/@([\p{L}\p{N}_.-]*)$/u);
  const mentionSuggestions = mentionMatch
    ? mentionUsernames
        .filter((username) =>
          username.toLocaleLowerCase().startsWith(mentionMatch[1].toLocaleLowerCase()),
        )
        .slice(0, 5)
    : [];

  const applyMention = (username: string) => {
    if (!mentionMatch || mentionMatch.index === undefined) return;
    onCommentChange(
      `${comment.slice(0, mentionMatch.index)}@${username} ${comment.slice(
        mentionMatch.index + mentionMatch[0].length,
      )}`,
    );
  };

  const beginEdit = (activity: CaseActivityDTO) => {
    setEditingId(activity.id);
    setEditComment(activity.comment ?? '');
  };

  const saveEdit = async (activityId: string) => {
    const nextComment = editComment.trim();
    if (!nextComment) return;

    setSavingId(activityId);
    try {
      if (await onEditComment(activityId, nextComment)) {
        setEditingId(null);
        setEditComment('');
      }
    } finally {
      setSavingId(null);
    }
  };

  const deleteComment = async (activityId: string) => {
    if (!window.confirm('确定删除这条评论吗？此操作无法撤销。')) return;

    setDeletingId(activityId);
    try {
      await onDeleteComment(activityId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="panel mt-6 p-6" aria-label="分析时间线">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">分析时间线</h2>

      {canComment && (
        <div className="mb-6 flex flex-col gap-2">
          <textarea
            aria-label="发表评论"
            value={comment}
            maxLength={5000}
            rows={3}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="记录分析过程或补充说明"
            className="field-control w-full resize-y px-3 py-2 text-sm"
          />
          {mentionSuggestions.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5 rounded-[10px] border border-border bg-bg p-2"
              role="listbox"
              aria-label="可提及的项目成员"
            >
              {mentionSuggestions.map((username) => (
                <button
                  key={username}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => applyMention(username)}
                  className="rounded-full bg-surface-solid px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                >
                  @{username}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-secondary">
              输入 @用户名 可通知项目成员 ·{' '}
              {comment.length.toLocaleString('zh-CN')} / 5,000
            </span>
            <Button
              size="sm"
              onClick={() => void onSubmitComment()}
              disabled={commenting || !comment.trim()}
            >
              {commenting ? '发表中...' : '发表评论'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {activities.length ? (
        <ol className="space-y-3">
          {activities.map((activity) => {
            const editing = editingId === activity.id;
            const canManageComment =
              activity.type === 'COMMENT' && activity.canManage === true;

            return (
              <li key={activity.id} className="border-l-2 border-border pl-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">{activity.user.username}</span>
                  <span>{activityLabel(activity.type)}</span>
                  <time dateTime={activity.createdAt}>
                    {formatDateTime(activity.createdAt)}
                  </time>
                </div>

                {editing ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      aria-label="编辑评论"
                      value={editComment}
                      maxLength={5000}
                      rows={3}
                      onChange={(event) => setEditComment(event.target.value)}
                      className="field-control w-full resize-y px-3 py-2 text-sm"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingId(null);
                          setEditComment('');
                        }}
                        disabled={savingId === activity.id}
                      >
                        取消
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void saveEdit(activity.id)}
                        disabled={
                          savingId === activity.id ||
                          !editComment.trim() ||
                          editComment.trim() === activity.comment
                        }
                      >
                        {savingId === activity.id ? '保存中...' : '保存修改'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {activity.comment && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-primary">
                        {activity.comment}
                      </p>
                    )}
                    {activity.changes && (
                      <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                        {Object.entries(activity.changes).map(([field, value]) => (
                          <li key={field}>
                            {field}：{String(value.from ?? '—')} → {String(value.to ?? '—')}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {canManageComment && !editing && (
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => beginEdit(activity)}
                      className="text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteComment(activity.id)}
                      disabled={deletingId === activity.id}
                      className="text-xs font-medium text-danger hover:text-danger/80 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === activity.id ? '删除中...' : '删除'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-text-secondary">暂无分析动态</p>
      )}
    </section>
  );
}
