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
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal body */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface-solid rounded-xl shadow-lg p-lg">
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
              className="w-full px-sm py-sm border border-border rounded-md text-text-primary
                         bg-surface-solid focus:outline-none focus:ring-2 focus:ring-accent/30
                         focus:border-accent"
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
              className="w-full px-sm py-sm border border-border rounded-md text-text-primary
                         bg-surface-solid focus:outline-none focus:ring-2 focus:ring-accent/30
                         focus:border-accent"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="flex gap-sm pt-sm">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-md py-sm rounded-md border border-border text-text-secondary
                         hover:bg-bg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-md py-sm rounded-md bg-accent text-white font-medium
                         hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isSubmitting ? '登录中…' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
