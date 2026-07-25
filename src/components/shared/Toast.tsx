'use client';

import { useToast, type ToastType } from '@/contexts/ToastContext';

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
      className="fixed bottom-4 right-4 z-50 flex w-full max-w-xs flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`rounded-md border bg-surface-solid px-4 py-3 text-sm shadow-lg ${typeStyles[toast.type]}`}
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
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
