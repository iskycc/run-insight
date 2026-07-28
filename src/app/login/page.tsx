'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { Input } from '@/components/shared/Input';
import { Button } from '@/components/shared/Button';
import { ChartLineUp } from '@phosphor-icons/react';

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/setup', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const status = (await response.json()) as { initialized?: boolean };
        if (status.initialized === false) router.replace('/setup');
      })
      .catch(() => {
        // Keep the normal login form available if the status check is
        // temporarily unavailable. The setup API remains the source of truth.
      });
    return () => controller.abort();
  }, [router]);

  useEffect(() => {
    if (user) router.replace('/workspace');
  }, [router, user]);

  if (user) return null;

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
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : '用户名或密码错误',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-86px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent text-white shadow-[0_18px_38px_rgba(17,96,242,0.20)]">
            <ChartLineUp size={34} weight="bold" aria-hidden="true" />
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-text-primary">
            Run Insight
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            用例结果分析平台
          </p>
        </div>

        <div className="bento-panel p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-[10px] bg-danger/10 px-3 py-2 text-sm text-danger">
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

      </div>
    </div>
  );
}
