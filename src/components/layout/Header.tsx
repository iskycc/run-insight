'use client';

import Link from 'next/link';
import { useAuth } from '@/components/shared/AuthProvider';
import { useEffect, useRef, useState } from 'react';
import {
  CaretDown,
  ChartLineUp,
  LockKey,
  SignOut,
  Sun,
} from '@phosphor-icons/react';
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
      <header className="app-header">
        <Link
          href="/"
          className="app-brand group flex min-w-max items-center gap-2.5 text-text-primary no-underline hover:no-underline"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent text-white shadow-[0_8px_24px_rgba(17,96,242,0.20)] transition-transform group-hover:-translate-y-0.5">
            <ChartLineUp size={22} weight="bold" aria-hidden="true" />
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.025em]">
            Run Insight
          </span>
        </Link>

        <div className="app-user flex items-center gap-2">
          {user ? (
            <>
              <button
                type="button"
                aria-label="外观跟随系统"
                title="外观跟随系统"
                className="hidden h-9 w-9 items-center justify-center rounded-full text-text-secondary transition hover:bg-bg hover:text-text-primary sm:inline-flex"
              >
                <Sun size={21} aria-hidden="true" />
              </button>
              <span
                aria-hidden="true"
                className="hidden h-6 w-px shrink-0 bg-border sm:block"
              />
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex min-h-10 items-center gap-2 rounded-[12px] px-2.5 text-sm font-normal text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#34405a] text-xs font-semibold text-white">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline">{user.username}</span>
                  <CaretDown
                    size={13}
                    weight="bold"
                    aria-hidden="true"
                    className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-[14px] border border-border bg-surface-solid p-1.5 shadow-lg"
                    role="menu"
                    aria-label="用户菜单"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-[9px] px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
                      onClick={() => {
                        setMenuOpen(false);
                        setChangePasswordOpen(true);
                      }}
                    >
                      <LockKey size={17} aria-hidden="true" />
                      修改密码
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-[9px] px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
                      onClick={() => {
                        setMenuOpen(false);
                        void logout();
                      }}
                    >
                      <SignOut size={17} aria-hidden="true" />
                      退出
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="min-h-10 rounded-[12px] bg-accent px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              登录
            </button>
          )}
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
