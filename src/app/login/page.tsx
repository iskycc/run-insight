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
    <div className="flex min-h-[calc(100vh-104px)] items-center justify-center px-md py-2xl">
      <div className="w-full max-w-sm">
        <div className="mb-2xl text-center">
          <div className="mb-md inline-flex h-16 w-16 items-center justify-center rounded-md bg-accent text-white shadow-[0_18px_38px_rgba(37,99,235,0.24)]">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-6" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Run Insight
          </h1>
          <p className="text-sm text-text-secondary mt-xs">
            用例结果分析平台
          </p>
        </div>

        <div className="panel p-lg">
          <form onSubmit={handleSubmit} className="space-y-md">
            {error && (
              <div className="rounded-md bg-danger/10 px-sm py-sm text-sm text-danger">
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
