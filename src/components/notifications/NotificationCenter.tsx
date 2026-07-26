'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Trash } from '@phosphor-icons/react';
import type {
  NotificationDTO,
  NotificationsResponse,
} from '@/types';

const LABELS: Record<NotificationDTO['type'], string> = {
  ASSIGNMENT: '将用例分派给了你',
  MENTION: '在评论中提到了你',
  WATCHED_COMMENT: '评论了你关注的用例',
  WATCHED_UPDATE: '更新了你关注的用例',
  DUE_SOON: '用例即将到期',
  OVERDUE: '用例已逾期',
  REPORT_GENERATED: '的定时报表快照已生成',
};

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) throw new Error('Notification request failed');
  return response.json() as Promise<T>;
}

export function NotificationCenter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [error, setError] = useState('');

  const loadUnreadCount = async () => {
    try {
      const data = await readJson<{ count: number }>(
        '/api/notifications/unread-count',
      );
      setUnreadCount(data.count);
    } catch {
      // 导航栏中的辅助请求失败不影响其他操作。
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await readJson<NotificationsResponse>(
        '/api/notifications?page=1&pageSize=10',
      );
      setNotifications(data.notifications);
    } catch {
      setError('通知加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void loadUnreadCount());
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void loadNotifications();
  };

  const markAllRead = async () => {
    try {
      await readJson('/api/notifications/read-all', { method: 'PATCH' });
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    } catch {
      setError('标记全部已读失败');
    }
  };

  const openNotification = async (notification: NotificationDTO) => {
    if (!notification.readAt) {
      try {
        await readJson(`/api/notifications/${notification.id}`, {
          method: 'PATCH',
        });
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        // 即使已读状态写入失败，仍允许用户访问目标用例。
      }
    }
    setOpen(false);
    if (notification.link.startsWith('/')) {
      window.location.assign(notification.link);
    }
  };

  const deleteNotification = async (
    event: React.MouseEvent,
    notification: NotificationDTO,
  ) => {
    event.stopPropagation();
    try {
      await readJson(`/api/notifications/${notification.id}`, {
        method: 'DELETE',
      });
      setNotifications((current) =>
        current.filter((item) => item.id !== notification.id),
      );
      if (!notification.readAt) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
    } catch {
      setError('删除通知失败');
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        className="relative flex h-10 w-10 items-center justify-center rounded-[12px] text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
        aria-label={unreadCount ? `通知，${unreadCount} 条未读` : '通知'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={20} weight={unreadCount ? 'fill' : 'regular'} />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="通知中心"
          className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-[18px] border border-border bg-surface-solid shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">通知</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                {unreadCount ? `${unreadCount} 条未读` : '已全部读完'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                <Check size={14} />
                全部已读
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="mx-3 mt-3 rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <div className="max-h-[26rem] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-text-secondary">
                加载中…
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-text-secondary">
                暂无通知
              </p>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={`group flex border-b border-border/70 transition-colors last:border-0 hover:bg-bg ${
                      notification.readAt ? '' : 'bg-accent/[0.045]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void openNotification(notification)}
                      className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-left"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          notification.readAt ? 'bg-border' : 'bg-accent'
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-5 text-text-primary">
                          <span className="font-medium">
                            {notification.actor?.username ?? '系统'}
                          </span>{' '}
                          {LABELS[notification.type]}
                        </span>
                        <span className="mt-1 block truncate text-xs text-text-secondary">
                          {notification.case.caseNo} · {notification.case.name}
                        </span>
                        <time
                          className="mt-1 block text-[11px] text-text-secondary"
                          dateTime={notification.createdAt}
                        >
                          {new Date(notification.createdAt).toLocaleString('zh-CN')}
                        </time>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="删除通知"
                      onClick={(event) =>
                        void deleteNotification(event, notification)
                      }
                      className="m-3 ml-0 self-start rounded-md p-1 text-text-secondary opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
