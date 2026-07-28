'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/shared/Button';

type LoginPromptProps = {
  open: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  loginError?: string;
};

export function LoginPrompt({ open, onClose, onLogin, loginError }: LoginPromptProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onLogin(username, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      {/* Backdrop overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal body */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-prompt-title"
        className="panel relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto p-6 shadow-lg"
      >
        <h2 id="login-prompt-title" className="mb-4 text-lg font-semibold text-text-primary">
          请先登录
        </h2>

        {loginError && (
          <div className="mb-2 px-2 py-1 bg-danger/10 text-danger text-sm rounded-md">
            {loginError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-2">
          <div>
            <label
              htmlFor="login-username"
              className="block text-sm text-text-secondary mb-1"
            >
              用户名
            </label>
            <input
              id="login-username"
              type="text"
              aria-label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field-control h-10 w-full px-2 text-text-primary"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm text-text-secondary mb-1"
            >
              密码
            </label>
            <input
              id="login-password"
              type="password"
              aria-label="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-control h-10 w-full px-2 text-text-primary"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border bg-bg px-4 py-2 text-text-secondary transition-colors hover:text-text-primary"
            >
              取消
            </button>
            <Button
              type="submit"
              loading={isSubmitting}
              loadingLabel="登录中…"
              className="flex-1"
            >
              登录
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
