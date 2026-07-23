'use client';

import Link from 'next/link';
import { useAuth } from '@/components/shared/AuthProvider';
import { useState } from 'react';
import { LoginPrompt } from '@/components/shared/LoginPrompt';

export function Header() {
  const { user, login, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleLogin = async (username: string, password: string) => {
    try {
      setLoginError('');
      await login(username, password);
      setShowLogin(false);
    } catch {
      setLoginError('用户名或密码错误');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface-solid/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-md">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-sm text-text-primary no-underline">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            >
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-6" />
            </svg>
            <span className="text-base font-semibold tracking-tight">
              Run Insight
            </span>
          </Link>

          {/* Right: user status */}
          <div className="flex items-center gap-sm">
            {user ? (
              <>
                <span className="text-sm text-text-secondary">{user.username}</span>
                <button
                  onClick={() => logout()}
                  className="px-sm py-xs text-sm text-text-secondary hover:text-danger
                             rounded-md hover:bg-bg transition-colors"
                >
                  退出
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="px-md py-xs text-sm font-medium text-white bg-accent
                           rounded-md hover:bg-accent-hover transition-colors"
              >
                登录
              </button>
            )}
          </div>
        </div>
      </header>

      <LoginPrompt
        open={showLogin}
        onClose={() => {
          setShowLogin(false);
          setLoginError('');
        }}
        onLogin={handleLogin}
        loginError={loginError}
      />
    </>
  );
}
