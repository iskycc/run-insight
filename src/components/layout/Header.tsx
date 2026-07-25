'use client';

import Link from 'next/link';
import { useAuth } from '@/components/shared/AuthProvider';
import { useEffect, useRef, useState } from 'react';
import { LoginPrompt } from '@/components/shared/LoginPrompt';
import { ChangePasswordModal } from '@/components/shared/ChangePasswordModal';

export function Header() {
  const { user, login, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

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
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <span>{user.username}</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="m3 4.5 3 3 3-3" />
                  </svg>
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-40 overflow-hidden rounded-md border border-border bg-surface-solid py-1 shadow-lg"
                    role="menu"
                    aria-label="用户菜单"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
                      onClick={() => {
                        setMenuOpen(false);
                        setChangePasswordOpen(true);
                      }}
                    >
                      修改密码
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
                      onClick={() => {
                        setMenuOpen(false);
                        void logout();
                      }}
                    >
                      退出
                    </button>
                  </div>
                )}
              </div>
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
      <ChangePasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onLogout={logout}
      />
    </>
  );
}
