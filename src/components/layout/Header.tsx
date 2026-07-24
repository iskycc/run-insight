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
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface-solid/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-4 sm:px-5">
          <Link href="/" className="group flex items-center gap-3 text-text-primary no-underline hover:no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] transition-transform group-hover:-translate-y-0.5">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M7 16l4-8 4 4 4-6" />
              </svg>
            </span>
            <span className="text-base font-semibold tracking-tight">
              Run Insight
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm font-medium text-text-secondary sm:inline">
                  {user.username}
                </span>
                <button
                  onClick={() => logout()}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  退出
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
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
