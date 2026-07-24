'use client';

import { useState, type FormEvent } from 'react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop overlay */}
      <div
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal body */}
      <div className="panel relative z-10 mx-4 w-full max-w-sm p-lg shadow-lg">
        <h2 className="text-lg font-semibold text-text-primary mb-md">
          请先登录
        </h2>

        {loginError && (
          <div className="mb-sm px-sm py-xs bg-danger/10 text-danger text-sm rounded-md">
            {loginError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-sm">
          <div>
            <label
              htmlFor="login-username"
              className="block text-sm text-text-secondary mb-xs"
            >
              用户名
            </label>
            <input
              id="login-username"
              type="text"
              aria-label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field-control h-10 w-full px-sm text-text-primary"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm text-text-secondary mb-xs"
            >
              密码
            </label>
            <input
              id="login-password"
              type="password"
              aria-label="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-control h-10 w-full px-sm text-text-primary"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="flex gap-sm pt-sm">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border bg-bg px-md py-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-md bg-accent px-md py-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {isSubmitting ? '登录中…' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
