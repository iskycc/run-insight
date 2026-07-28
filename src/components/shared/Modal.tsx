'use client';

import { type ReactNode, useEffect, useId } from 'react';
import { X } from '@phosphor-icons/react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const titleId = useId();

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent background scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Overlay */}
      <div
        data-testid="modal-overlay"
        className="modal-backdrop absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="modal-panel relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[20px] border border-white/70 bg-surface-solid shadow-lg sm:max-h-[calc(100dvh-3rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-bg text-text-secondary transition-colors hover:text-text-primary"
            aria-label="关闭"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-6 py-4">{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-bg/40 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
