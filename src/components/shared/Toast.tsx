'use client';

import { useToast, type ToastType } from '@/contexts/ToastContext';
import { X } from '@phosphor-icons/react';

const typeStyles: Record<ToastType, string> = {
  success: 'border-success/30 text-success',
  error: 'border-danger/30 text-danger',
  info: 'border-accent/30 text-accent',
};

const typeLabels: Record<ToastType, string> = {
  success: '成功',
  error: '错误',
  info: '提示',
};

export function ToastContainer() {
  const { toasts, hideToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`toast-enter rounded-[14px] border bg-surface-solid/95 px-4 py-3 text-sm shadow-lg backdrop-blur-xl ${typeStyles[toast.type]}`}
        >
          <div className="flex items-start gap-2">
            <span className="font-semibold">{typeLabels[toast.type]}</span>
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => hideToast(toast.id)}
              aria-label="关闭通知"
              className="ml-1 leading-none opacity-70 hover:opacity-100"
            >
              <X size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
