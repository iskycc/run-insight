'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Modal } from '@/components/shared/Modal';
import { useToast } from '@/contexts/ToastContext';
import { ApiError, fetchJson } from '@/lib/fetch';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  onLogout: () => Promise<void>;
}

function passwordErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '修改密码失败，请稍后重试';
  if (error.status === 400) return error.message;
  if (error.status === 401) {
    return error.code === 'AUTH_FAILED' ? '当前密码错误' : '登录状态已失效，请重新登录';
  }
  if (error.status === 403) return '没有修改密码的权限';
  return error.message;
}

export function ChangePasswordModal({
  open,
  onClose,
  onLogout,
}: ChangePasswordModalProps) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [changed, setChanged] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setChanged(false);
  };

  const close = () => {
    if (isSubmitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentPassword) {
      setError('当前密码为必填');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setError('新密码长度必须为 8 到 128 个字符');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await fetchJson<{ success: true }>('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
        reloadOnUnauthorized: false,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      try {
        await onLogout();
      } catch {
        // The password endpoint already cleared the cookie and revoked every
        // session. Keep presenting a successful password change if the
        // follow-up client state refresh encounters a transient network error.
      }
      setChanged(true);
      showToast({ message: '密码修改成功，请重新登录', type: 'success' });
    } catch (requestError) {
      const message = passwordErrorMessage(requestError);
      setError(message);
      showToast({ message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={changed ? '密码已修改' : '修改密码'}
      footer={
        changed ? (
          <Button onClick={close}>知道了</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={isSubmitting}>
              取消
            </Button>
            <Button
              type="submit"
              form="change-password-form"
              disabled={isSubmitting}
            >
              {isSubmitting ? '修改中...' : '确认修改'}
            </Button>
          </>
        )
      }
    >
      {changed ? (
        <p className="text-sm text-text-secondary" role="status">
          新密码已生效，所有登录会话均已注销。请使用新密码重新登录。
        </p>
      ) : (
        <form
          id="change-password-form"
          className="space-y-4"
          onSubmit={handleSubmit}
          noValidate
        >
          <Input
            label="当前密码"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={isSubmitting}
            required
          />
          <Input
            label="新密码"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={isSubmitting}
            minLength={8}
            maxLength={128}
            aria-describedby="change-password-hint"
            required
          />
          <p id="change-password-hint" className="-mt-2 text-xs text-text-secondary">
            长度为 8 到 128 个字符
          </p>
          <Input
            label="确认新密码"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isSubmitting}
            minLength={8}
            maxLength={128}
            required
          />
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
