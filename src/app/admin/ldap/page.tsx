'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, FloppyDisk, PlugsConnected } from '@phosphor-icons/react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Switch } from '@/components/shared/Switch';
import { Textarea } from '@/components/shared/Textarea';
import { useAuth } from '@/components/shared/AuthProvider';
import { useToast } from '@/contexts/ToastContext';
import { formatDateTime } from '@/lib/date-time';
import { ApiError, fetchJson } from '@/lib/fetch';
import type {
  LdapConfigurationDTO,
  TestLdapConfigurationRequest,
  UpdateLdapConfigurationRequest,
} from '@/types';

type FormState = Omit<LdapConfigurationDTO, 'updatedAt'> & {
  bindPassword: string;
};

const INITIAL_FORM: FormState = {
  enabled: false,
  url: 'ldaps://ldap.example.com:636',
  bindDn: '',
  bindPassword: '',
  passwordConfigured: false,
  searchBase: '',
  userFilter: '(uid={{username}})',
  uniqueIdAttribute: 'entryUUID',
  startTls: true,
  tlsRejectUnauthorized: true,
  tlsCaCertificate: '',
  connectTimeoutMs: 5000,
  operationTimeoutMs: 5000,
  allowInsecure: false,
};

function toRequest(form: FormState): UpdateLdapConfigurationRequest {
  return {
    enabled: form.enabled,
    url: form.url,
    bindDn: form.bindDn,
    ...(form.bindPassword ? { bindPassword: form.bindPassword } : {}),
    searchBase: form.searchBase,
    userFilter: form.userFilter,
    uniqueIdAttribute: form.uniqueIdAttribute,
    startTls: form.startTls,
    tlsRejectUnauthorized: form.tlsRejectUnauthorized,
    tlsCaCertificate: form.tlsCaCertificate,
    connectTimeoutMs: form.connectTimeoutMs,
    operationTimeoutMs: form.operationTimeoutMs,
    allowInsecure: form.allowInsecure,
  };
}

function ToggleField({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      label={label}
      description={description}
    />
  );
}

export default function LdapConfigurationPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testUsername, setTestUsername] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [testResult, setTestResult] = useState('');

  useEffect(() => {
    if (!authLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [authLoading, router, user]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const configuration = await fetchJson<LdapConfigurationDTO>(
          '/api/admin/ldap',
          { signal: controller.signal, cache: 'no-store' },
        );
        if (controller.signal.aborted) return;
        setForm({ ...configuration, bindPassword: '' });
        setUpdatedAt(configuration.updatedAt);
        setError('');
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : '加载 LDAP 配置失败',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const updateForm = <Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
    setTestResult('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await fetchJson<LdapConfigurationDTO>('/api/admin/ldap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toRequest(form)),
      });
      setForm({ ...saved, bindPassword: '' });
      setUpdatedAt(saved.updatedAt);
      showToast({ message: 'LDAP 配置已保存', type: 'success' });
    } catch (saveError) {
      const message =
        saveError instanceof ApiError ? saveError.message : '保存 LDAP 配置失败';
      setError(message);
      showToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setError('');
    setTestResult('');
    try {
      const body: TestLdapConfigurationRequest = {
        configuration: toRequest(form),
        testUsername,
        testPassword,
      };
      const result = await fetchJson<{ success: true; message: string }>(
        '/api/admin/ldap/test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      setTestPassword('');
      setTestResult(result.message);
      showToast({ message: result.message, type: 'success' });
    } catch (testError) {
      const message =
        testError instanceof ApiError ? testError.message : 'LDAP 连接测试失败';
      setError(message);
      showToast({ message, type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  if (authLoading || user?.role !== 'ADMIN') return null;

  return (
    <PageContainer
      title="LDAP 配置"
      subtitle="配置目录认证、加密保存绑定密码，并在启用前完成真实用户登录测试"
      actions={
        <Button
          onClick={() => void save()}
          disabled={loading || testing}
          loading={saving}
          loadingLabel="保存中…"
        >
          <FloppyDisk size={17} aria-hidden="true" />
          保存配置
        </Button>
      }
    >
      <div className="space-y-4">
        <section className="bento-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">服务状态</h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                LDAP 是附加认证源；关闭或连接异常都不会禁用已有本地账号。
              </p>
            </div>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                form.enabled
                  ? 'bg-success/10 text-success'
                  : 'bg-bg text-text-secondary'
              }`}
            >
              {form.enabled ? '已启用' : '未启用'}
            </span>
          </div>
          <div className="mt-4">
            <ToggleField
              checked={form.enabled}
              disabled={loading || saving}
              label="允许 LDAP 用户登录"
              description="首次登录创建为编辑者；现有管理员、编辑者和查看者继续使用本地密码。"
              onChange={(checked) => updateForm('enabled', checked)}
            />
          </div>
          {updatedAt && (
            <p className="mt-3 text-xs text-text-secondary">
              最近保存：{formatDateTime(updatedAt)}
            </p>
          )}
        </section>

        <section className="bento-panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-text-primary">目录连接</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Input
              label="LDAP 地址"
              value={form.url}
              onChange={(event) => updateForm('url', event.target.value)}
              placeholder="ldaps://ldap.example.com:636"
              disabled={loading || saving || testing}
            />
            <Input
              label="绑定 DN"
              value={form.bindDn}
              onChange={(event) => updateForm('bindDn', event.target.value)}
              placeholder="cn=run-insight,ou=service-accounts,dc=example,dc=com"
              disabled={loading || saving || testing}
            />
            <Input
              label={
                form.passwordConfigured
                  ? '绑定密码（留空则保留原密码）'
                  : '绑定密码'
              }
              type="password"
              autoComplete="new-password"
              value={form.bindPassword}
              onChange={(event) => updateForm('bindPassword', event.target.value)}
              placeholder={form.passwordConfigured ? '已加密保存' : '输入绑定密码'}
              disabled={loading || saving || testing}
            />
            <Input
              label="搜索 Base DN"
              value={form.searchBase}
              onChange={(event) => updateForm('searchBase', event.target.value)}
              placeholder="ou=people,dc=example,dc=com"
              disabled={loading || saving || testing}
            />
            <Input
              label="用户过滤器"
              value={form.userFilter}
              onChange={(event) => updateForm('userFilter', event.target.value)}
              placeholder="(uid={{username}})"
              disabled={loading || saving || testing}
            />
            <Input
              label="唯一标识属性"
              value={form.uniqueIdAttribute}
              onChange={(event) =>
                updateForm('uniqueIdAttribute', event.target.value)
              }
              placeholder="entryUUID"
              disabled={loading || saving || testing}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-text-secondary">
            用户过滤器必须包含 {'{{username}}'}；OpenLDAP 通常使用 entryUUID，
            Active Directory 通常使用 objectGUID。
          </p>
        </section>

        <section className="bento-panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-text-primary">TLS 与超时</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <ToggleField
              checked={form.startTls}
              disabled={loading || saving || testing || form.url.startsWith('ldaps://')}
              label="使用 StartTLS"
              description="用于 ldap:// 连接；ldaps:// 会直接建立 TLS。"
              onChange={(checked) => updateForm('startTls', checked)}
            />
            <ToggleField
              checked={form.tlsRejectUnauthorized}
              disabled={loading || saving || testing}
              label="校验服务器证书"
              description="生产环境应保持启用，以阻止伪造 LDAP 服务。"
              onChange={(checked) =>
                updateForm('tlsRejectUnauthorized', checked)
              }
            />
            <ToggleField
              checked={form.allowInsecure}
              disabled={loading || saving || testing}
              label="允许明文 LDAP"
              description="仅供隔离开发环境调试，不建议在内网生产环境开启。"
              onChange={(checked) => updateForm('allowInsecure', checked)}
            />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Input
              label="连接超时（毫秒）"
              type="number"
              min={100}
              max={60000}
              value={form.connectTimeoutMs}
              onChange={(event) =>
                updateForm('connectTimeoutMs', Number(event.target.value))
              }
              disabled={loading || saving || testing}
            />
            <Input
              label="操作超时（毫秒）"
              type="number"
              min={100}
              max={60000}
              value={form.operationTimeoutMs}
              onChange={(event) =>
                updateForm('operationTimeoutMs', Number(event.target.value))
              }
              disabled={loading || saving || testing}
            />
          </div>
          <Textarea
            label="私有 CA 证书（PEM，可选）"
            value={form.tlsCaCertificate}
            onChange={(event) =>
              updateForm('tlsCaCertificate', event.target.value)
            }
            rows={6}
            spellCheck={false}
            placeholder="-----BEGIN CERTIFICATE-----"
            disabled={loading || saving || testing}
            wrapperClassName="mt-4"
            className="font-mono text-xs"
          />
        </section>

        <section className="bento-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">测试配置</h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                使用当前表单配置执行 TLS、服务账号绑定、用户搜索和测试用户绑定。
                测试密码不会保存。
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => void testConnection()}
              disabled={loading || saving}
              loading={testing}
              loadingLabel="测试中…"
            >
              <PlugsConnected size={17} aria-hidden="true" />
              测试连接
            </Button>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Input
              label="测试用户名"
              value={testUsername}
              onChange={(event) => setTestUsername(event.target.value)}
              autoComplete="username"
              disabled={loading || saving || testing}
            />
            <Input
              label="测试密码"
              type="password"
              value={testPassword}
              onChange={(event) => setTestPassword(event.target.value)}
              autoComplete="current-password"
              disabled={loading || saving || testing}
            />
          </div>
          {testResult && (
            <p className="mt-4 flex items-center gap-2 text-sm text-success" role="status">
              <CheckCircle size={18} weight="fill" aria-hidden="true" />
              {testResult}
            </p>
          )}
        </section>

        <section className="surface-subtle p-4">
          <p className="text-sm leading-6 text-text-secondary">
            绑定密码使用 AES-256-GCM 加密，随机 AES 密钥与配置一起持久化，API、页面和审计日志均不会返回密钥或密码。
            由于密钥与密文位于同一数据库，此方案用于避免明文保存，不等同于外部密钥管理系统。
          </p>
        </section>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </PageContainer>
  );
}
