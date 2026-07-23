'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { Input } from '@/components/shared/Input';
import { Button } from '@/components/shared/Button';

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 已登录则跳转工作台
  if (user) {
    router.push('/workspace');
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await login(username, password);
      router.push('/workspace');
    } catch {
      setError('用户名或密码错误');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-md">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-2xl">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-accent/10 mb-md">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-6" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
            Run Insight
          </h1>
          <p className="text-sm text-text-secondary mt-xs">
            用例结果分析平台
          </p>
        </div>

        {/* 登录卡片 */}
        <div className="card-solid p-lg">
          <form onSubmit={handleSubmit} className="space-y-md">
            {error && (
              <div className="px-sm py-sm bg-danger/10 text-danger text-sm rounded-md">
                {error}
              </div>
            )}

            <Input
              label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              required
            />

            <Input
              label="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              type="password"
              autoComplete="current-password"
              required
            />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? '登录中…' : '登录'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-text-secondary/60 mt-lg">
          默认账号：admin / admin123
        </p>
      </div>
    </div>
  );
}
