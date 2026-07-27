'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  Eye,
  ShieldCheck,
  UserCircleGear,
} from '@phosphor-icons/react';
import { useAuth } from '@/components/shared/AuthProvider';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import type { InstanceSetupStatusResponse } from '@/types';

type SetupPhase = 'checking' | 'ready' | 'submitting' | 'unavailable';

type SetupErrors = Partial<
  Record<
    | 'adminUsername'
    | 'setupToken'
    | 'adminPassword'
    | 'adminPasswordConfirm'
    | 'viewerUsername'
    | 'viewerPassword'
    | 'viewerPasswordConfirm',
    string
  >
>;

function normalizedUsername(value: string) {
  return value.normalize('NFKC').trim();
}

export default function SetupPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [phase, setPhase] = useState<SetupPhase>('checking');
  const [setupToken, setSetupToken] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [viewerUsername, setViewerUsername] = useState('viewer');
  const [viewerPassword, setViewerPassword] = useState('');
  const [viewerPasswordConfirm, setViewerPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<SetupErrors>({});
  const [requestError, setRequestError] = useState('');

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/setup', {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw new Error('status unavailable');
    return (await response.json()) as InstanceSetupStatusResponse;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal)
      .then((status) => {
        if (status.initialized) {
          router.replace('/login');
          return;
        }
        if (!status.setupAvailable) {
          setRequestError(
            '服务器尚未配置初始化密钥，请先设置 INSTANCE_SETUP_TOKEN 并重启应用。',
          );
          setPhase('unavailable');
          return;
        }
        setPhase('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setRequestError('无法检查实例状态，请确认数据库迁移已完成后重试。');
        setPhase('unavailable');
      });
    return () => controller.abort();
  }, [loadStatus, router]);

  const validate = () => {
    const nextErrors: SetupErrors = {};
    const normalizedAdmin = normalizedUsername(adminUsername);
    const normalizedViewer = normalizedUsername(viewerUsername);
    const usernamePattern = /^[^\s\u0000-\u001f\u007f]{3,50}$/u;

    if (setupToken.length < 32) {
      nextErrors.setupToken = '请输入部署配置中的初始化密钥';
    }
    if (!usernamePattern.test(normalizedAdmin)) {
      nextErrors.adminUsername = '请输入 3 到 50 个不含空格的字符';
    }
    if (!usernamePattern.test(normalizedViewer)) {
      nextErrors.viewerUsername = '请输入 3 到 50 个不含空格的字符';
    }
    if (
      normalizedAdmin
      && normalizedAdmin.toLowerCase() === normalizedViewer.toLowerCase()
    ) {
      nextErrors.viewerUsername = '只读用户名不能与管理员相同';
    }
    if (adminPassword.length < 12 || adminPassword.length > 128) {
      nextErrors.adminPassword = '密码长度必须为 12 到 128 个字符';
    } else if (adminPassword === normalizedAdmin) {
      nextErrors.adminPassword = '密码不能与用户名相同';
    }
    if (adminPasswordConfirm !== adminPassword) {
      nextErrors.adminPasswordConfirm = '两次输入的管理员密码不一致';
    }
    if (viewerPassword.length < 12 || viewerPassword.length > 128) {
      nextErrors.viewerPassword = '密码长度必须为 12 到 128 个字符';
    } else if (viewerPassword === normalizedViewer) {
      nextErrors.viewerPassword = '密码不能与用户名相同';
    } else if (viewerPassword === adminPassword) {
      nextErrors.viewerPassword = '只读用户不能与管理员使用相同密码';
    }
    if (viewerPasswordConfirm !== viewerPassword) {
      nextErrors.viewerPasswordConfirm = '两次输入的只读用户密码不一致';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setRequestError('');
    if (!validate()) return;

    const normalizedAdmin = normalizedUsername(adminUsername);
    const normalizedViewer = normalizedUsername(viewerUsername);
    setPhase('submitting');
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken,
          adminUsername: normalizedAdmin,
          adminPassword,
          viewerUsername: normalizedViewer,
          viewerPassword,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        if (response.status === 409) {
          router.replace('/login');
          return;
        }
        throw new Error(body?.message || '初始化失败');
      }

      try {
        await login(normalizedAdmin, adminPassword);
        router.replace('/workspace');
      } catch {
        // Account creation is already committed. Let the administrator sign in
        // normally if the follow-up login encountered a transient failure.
        router.replace('/login');
      }
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : '初始化失败，请稍后重试。',
      );
      setPhase('ready');
    }
  };

  if (phase === 'checking') {
    return (
      <div className="flex min-h-[calc(100vh-86px)] items-center justify-center px-4">
        <div className="bento-panel w-full max-w-md px-8 py-10 text-center">
          <span
            className="mx-auto mb-5 block h-9 w-9 animate-spin rounded-full border-[3px] border-accent/20 border-t-accent"
            aria-hidden="true"
          />
          <h1 className="text-xl font-semibold text-text-primary">正在检查实例状态</h1>
          <p className="mt-2 text-sm text-text-secondary">首次启动通常只需要几秒钟。</p>
        </div>
      </div>
    );
  }

  if (phase === 'unavailable') {
    return (
      <div className="flex min-h-[calc(100vh-86px)] items-center justify-center px-4">
        <div className="bento-panel w-full max-w-md px-8 py-10 text-center">
          <UserCircleGear
            className="mx-auto mb-5 text-danger"
            size={44}
            weight="duotone"
            aria-hidden="true"
          />
          <h1 className="text-xl font-semibold text-text-primary">初始化服务暂不可用</h1>
          <p role="alert" className="mt-2 text-sm leading-6 text-text-secondary">
            {requestError}
          </p>
          <Button
            className="mt-6"
            onClick={() => {
              setPhase('checking');
              setRequestError('');
              void loadStatus()
                .then((status) => {
                  if (status.initialized) {
                    router.replace('/login');
                    return;
                  }
                  if (!status.setupAvailable) {
                    setRequestError(
                      '服务器尚未配置初始化密钥，请先设置 INSTANCE_SETUP_TOKEN 并重启应用。',
                    );
                    setPhase('unavailable');
                    return;
                  }
                  setPhase('ready');
                })
                .catch(() => {
                  setRequestError(
                    '无法检查实例状态，请确认数据库迁移已完成后重试。',
                  );
                  setPhase('unavailable');
                });
            }}
          >
            重新检查
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent text-white shadow-[0_18px_38px_rgba(17,96,242,0.20)]">
            <UserCircleGear size={34} weight="duotone" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            First-run setup
          </p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-text-primary">
            初始化 Run Insight
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-secondary">
            创建实例的首个管理员和只读账号。提交成功后初始化入口将永久关闭。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {requestError && (
            <div
              role="alert"
              className="rounded-[12px] border border-danger/15 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {requestError}
            </div>
          )}

          <section className="bento-panel p-5 sm:p-6" aria-labelledby="setup-token-title">
            <div className="mb-4">
              <h2 id="setup-token-title" className="text-base font-semibold text-text-primary">
                验证部署身份
              </h2>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                输入部署环境中配置的 INSTANCE_SETUP_TOKEN，防止他人抢先注册管理员。
              </p>
            </div>
            <Input
              label="实例初始化密钥"
              type="password"
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
              error={errors.setupToken}
              autoComplete="off"
              minLength={32}
              required
            />
          </section>

          <section className="bento-panel p-5 sm:p-6" aria-labelledby="admin-account-title">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent/10 text-accent">
                <ShieldCheck size={22} weight="duotone" aria-hidden="true" />
              </span>
              <div>
                <h2 id="admin-account-title" className="text-base font-semibold text-text-primary">
                  管理员账号
                </h2>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  拥有系统管理权限，并成为默认组织的所有者。
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="管理员用户名"
                value={adminUsername}
                onChange={(event) => setAdminUsername(event.target.value)}
                error={errors.adminUsername}
                autoComplete="username"
                maxLength={50}
                required
              />
              <div className="hidden sm:block" aria-hidden="true" />
              <Input
                label="管理员密码"
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                error={errors.adminPassword}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
              <Input
                label="确认管理员密码"
                type="password"
                value={adminPasswordConfirm}
                onChange={(event) => setAdminPasswordConfirm(event.target.value)}
                error={errors.adminPasswordConfirm}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </div>
          </section>

          <section className="bento-panel p-5 sm:p-6" aria-labelledby="viewer-account-title">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-info/10 text-info">
                <Eye size={22} weight="duotone" aria-hidden="true" />
              </span>
              <div>
                <h2 id="viewer-account-title" className="text-base font-semibold text-text-primary">
                  只读账号
                </h2>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  可由管理员加入项目后查看数据，不具备修改与管理权限。
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="只读用户名"
                value={viewerUsername}
                onChange={(event) => setViewerUsername(event.target.value)}
                error={errors.viewerUsername}
                autoComplete="off"
                maxLength={50}
                required
              />
              <div className="hidden sm:block" aria-hidden="true" />
              <Input
                label="只读用户密码"
                type="password"
                value={viewerPassword}
                onChange={(event) => setViewerPassword(event.target.value)}
                error={errors.viewerPassword}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
              <Input
                label="确认只读用户密码"
                type="password"
                value={viewerPasswordConfirm}
                onChange={(event) => setViewerPasswordConfirm(event.target.value)}
                error={errors.viewerPasswordConfirm}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </div>
          </section>

          <div className="bento-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-xs leading-5 text-text-secondary">
              <CheckCircle
                className="mt-0.5 shrink-0 text-success"
                size={17}
                weight="fill"
                aria-hidden="true"
              />
              <span>账号密码只会以安全哈希保存；初始化完成后请妥善保管凭据。</span>
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full shrink-0 sm:w-auto"
              disabled={phase === 'submitting'}
            >
              {phase === 'submitting' ? '正在初始化…' : '创建账号并开始使用'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
