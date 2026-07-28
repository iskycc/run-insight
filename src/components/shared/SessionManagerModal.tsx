'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Modal } from '@/components/shared/Modal';
import { LoadingState } from '@/components/shared/LoadingState';
import { formatDateTime, formatRelativeTime } from '@/lib/date-time';
import { ApiError, fetchJson } from '@/lib/fetch';
import type { SessionDTO, SessionsResponse } from '@/types';

interface SessionManagerModalProps {
  open: boolean;
  onClose: () => void;
  onCurrentRevoked: () => Promise<void>;
}

function statusLabel(status: SessionDTO['status']) {
  if (status === 'REVOKED') return '已注销';
  if (status === 'EXPIRED') return '已过期';
  return '有效';
}

export function SessionManagerModal({
  open,
  onClose,
  onCurrentRevoked,
}: SessionManagerModalProps) {
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage('');
    try {
      const data = await fetchJson<SessionsResponse>('/api/auth/sessions', {
        signal,
        cache: 'no-store',
      });
      if (!signal?.aborted) setSessions(data.sessions);
    } catch (error) {
      if (!signal?.aborted) {
        setMessage(error instanceof ApiError ? error.message : '加载会话失败');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void loadSessions(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadSessions, open]);

  const revokeSession = async (session: SessionDTO) => {
    if (!window.confirm(`确定注销“${session.deviceInfo}”的登录会话吗？`)) {
      return;
    }
    setBusyId(session.id);
    setMessage('');
    try {
      await fetchJson(`/api/auth/sessions/${session.id}`, {
        method: 'DELETE',
      });
      if (session.isCurrent) {
        await onCurrentRevoked();
        onClose();
        return;
      }
      setMessage('会话已注销');
      await loadSessions();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '注销会话失败');
    } finally {
      setBusyId('');
    }
  };

  const revokeOtherSessions = async () => {
    if (!window.confirm('确定注销除当前设备外的所有登录会话吗？')) return;
    setBusyId('others');
    setMessage('');
    try {
      const result = await fetchJson<{ revoked: number }>('/api/auth/sessions', {
        method: 'DELETE',
      });
      setMessage(`已注销 ${result.revoked} 个其他会话`);
      await loadSessions();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '注销其他会话失败');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="登录会话"
      footer={
        <>
          <Button
            variant="danger"
            onClick={() => void revokeOtherSessions()}
            disabled={!!busyId || !sessions.some(
              (session) => session.status === 'ACTIVE' && !session.isCurrent,
            )}
          >
            注销其他会话
          </Button>
          <Button variant="secondary" onClick={onClose}>关闭</Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-text-secondary">
        设备信息由浏览器类型和操作系统概括生成，不保存原始令牌或 IP 地址。
      </p>
      {loading ? (
        <LoadingState compact label="正在加载登录会话…" className="justify-center py-6" />
      ) : sessions.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">暂无登录会话</p>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-text-primary">{session.deviceInfo}</p>
                  {session.isCurrent && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      当前设备
                    </span>
                  )}
                  <span className="text-xs text-text-secondary">
                    {statusLabel(session.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  最后活动{' '}
                  <time
                    dateTime={session.lastSeenAt}
                    title={formatDateTime(session.lastSeenAt)}
                  >
                    {formatRelativeTime(session.lastSeenAt)}
                  </time>
                  {' · '}
                  到期 {formatDateTime(session.expiresAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant="danger"
                disabled={session.status !== 'ACTIVE' || !!busyId}
                onClick={() => void revokeSession(session)}
              >
                {busyId === session.id ? '注销中...' : '注销'}
              </Button>
            </div>
          ))}
        </div>
      )}
      {message && (
        <p className="mt-3 text-sm text-text-secondary" role="status">{message}</p>
      )}
    </Modal>
  );
}
