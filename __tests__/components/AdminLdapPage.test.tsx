/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LdapConfigurationPage from '@/app/admin/ldap/page';

const mockFetchJson = jest.fn();
const mockShowToast = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/lib/fetch', () => {
  const actual = jest.requireActual('@/lib/fetch');
  return {
    ...actual,
    fetchJson: (...args: unknown[]) => mockFetchJson(...args),
  };
});
jest.mock('@/components/shared/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      username: 'admin',
      role: 'ADMIN',
      authSource: 'LOCAL',
    },
    isLoading: false,
    login: jest.fn(),
    logout: jest.fn(),
    updateCurrentUser: jest.fn(),
  }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
    hideToast: jest.fn(),
    toasts: [],
  }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const configuration = {
  enabled: false,
  url: 'ldaps://ldap.example.com:636',
  bindDn: 'cn=service,dc=example,dc=com',
  passwordConfigured: true,
  searchBase: 'ou=people,dc=example,dc=com',
  userFilter: '(uid={{username}})',
  uniqueIdAttribute: 'entryUUID',
  startTls: true,
  tlsRejectUnauthorized: true,
  tlsCaCertificate: '',
  connectTimeoutMs: 5000,
  operationTimeoutMs: 5000,
  allowInsecure: false,
  updatedAt: '2026-07-28T01:00:00.000Z',
};

describe('LDAP configuration page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchJson.mockResolvedValue(configuration);
  });

  it('loads configuration without exposing the stored password or key', async () => {
    render(<LdapConfigurationPage />);

    expect(await screen.findByPlaceholderText('已加密保存')).toBeInTheDocument();
    expect(screen.getByDisplayValue(configuration.url)).toBeInTheDocument();
    expect(screen.getByLabelText('绑定密码（留空则保留原密码）')).toHaveValue('');
    expect(screen.getByPlaceholderText('已加密保存')).toBeInTheDocument();
    expect(screen.queryByText(/encryptionKey/)).not.toBeInTheDocument();
    expect(screen.getByText(/AES-256-GCM/)).toBeInTheDocument();
  });

  it('saves edits while preserving an existing blank password', async () => {
    render(<LdapConfigurationPage />);
    const user = userEvent.setup();
    await screen.findByText(/最近保存/);

    await user.clear(screen.getByLabelText('搜索 Base DN'));
    await user.type(
      screen.getByLabelText('搜索 Base DN'),
      'dc=example,dc=org',
    );
    await user.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => expect(mockFetchJson).toHaveBeenCalledTimes(2));
    const [, options] = mockFetchJson.mock.calls[1];
    const body = JSON.parse(options.body);
    expect(mockFetchJson.mock.calls[1][0]).toBe('/api/admin/ldap');
    expect(options.method).toBe('PUT');
    expect(body.searchBase).toBe('dc=example,dc=org');
    expect(body).not.toHaveProperty('bindPassword');
  });

  it('tests the current form with a password that is never retained', async () => {
    mockFetchJson
      .mockResolvedValueOnce(configuration)
      .mockResolvedValueOnce({
        success: true,
        message: 'LDAP 连接、用户搜索和用户认证均成功',
      });
    render(<LdapConfigurationPage />);
    const user = userEvent.setup();
    await screen.findByText(/最近保存/);

    await user.type(screen.getByLabelText('测试用户名'), 'alice');
    await user.type(screen.getByLabelText('测试密码'), 'user-password');
    await user.click(screen.getByRole('button', { name: '测试连接' }));

    expect(
      await screen.findByText('LDAP 连接、用户搜索和用户认证均成功'),
    ).toBeInTheDocument();
    const [, options] = mockFetchJson.mock.calls[1];
    const body = JSON.parse(options.body);
    expect(mockFetchJson.mock.calls[1][0]).toBe('/api/admin/ldap/test');
    expect(body.testUsername).toBe('alice');
    expect(body.testPassword).toBe('user-password');
    expect(screen.getByLabelText('测试密码')).toHaveValue('');
  });
});
