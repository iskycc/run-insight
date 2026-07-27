/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupPage from '@/app/setup/page';

const mockReplace = jest.fn();
const mockLogin = jest.fn();
const mockRouter = { replace: mockReplace };
const setupToken = 'setup-token-2026-very-long-and-random-value';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@/components/shared/AuthProvider', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

const originalFetch = globalThis.fetch;

function response(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

async function renderFreshSetup() {
  (globalThis.fetch as jest.Mock).mockImplementationOnce(() =>
    response({ initialized: false, setupAvailable: true }),
  );
  render(<SetupPage />);
  expect(
    await screen.findByRole('heading', { name: '初始化 Run Insight' }),
  ).toBeInTheDocument();
}

async function fillPasswords() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('实例初始化密钥'), setupToken);
  await user.type(screen.getByLabelText('管理员密码'), 'admin-password-2026');
  await user.type(
    screen.getByLabelText('确认管理员密码'),
    'admin-password-2026',
  );
  await user.type(screen.getByLabelText('只读用户密码'), 'viewer-password-2026');
  await user.type(
    screen.getByLabelText('确认只读用户密码'),
    'viewer-password-2026',
  );
  return user;
}

describe('SetupPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    mockLogin.mockResolvedValue(undefined);
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it('redirects initialized instances back to login', async () => {
    (globalThis.fetch as jest.Mock).mockImplementationOnce(() =>
      response({ initialized: true }),
    );

    render(<SetupPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('explains how to recover when the server has no setup token', async () => {
    (globalThis.fetch as jest.Mock).mockImplementationOnce(() =>
      response({ initialized: false, setupAvailable: false }),
    );

    render(<SetupPage />);

    expect(
      await screen.findByRole('heading', { name: '初始化服务暂不可用' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('INSTANCE_SETUP_TOKEN');
  });

  it('shows a recoverable status error without rendering the registration form', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    render(<SetupPage />);

    expect(
      await screen.findByRole('heading', { name: '初始化服务暂不可用' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('数据库迁移已完成');
    expect(
      screen.queryByRole('button', { name: '创建账号并开始使用' }),
    ).not.toBeInTheDocument();
  });

  it('validates confirmation and password separation before posting', async () => {
    await renderFreshSetup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('实例初始化密钥'), setupToken);
    await user.type(screen.getByLabelText('管理员密码'), 'same-password-2026');
    await user.type(
      screen.getByLabelText('确认管理员密码'),
      'different-password',
    );
    await user.type(screen.getByLabelText('只读用户密码'), 'same-password-2026');
    await user.type(
      screen.getByLabelText('确认只读用户密码'),
      'same-password-2026',
    );
    await user.click(screen.getByRole('button', { name: '创建账号并开始使用' }));

    expect(screen.getByText('两次输入的管理员密码不一致')).toBeInTheDocument();
    expect(
      screen.getByText('只读用户不能与管理员使用相同密码'),
    ).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('creates both accounts, signs in as admin, and opens the workspace', async () => {
    await renderFreshSetup();
    (globalThis.fetch as jest.Mock).mockImplementationOnce(() =>
      response(
        {
          initialized: true,
          adminUsername: 'admin',
          viewerUsername: 'viewer',
        },
        201,
      ),
    );
    const user = await fillPasswords();

    await user.click(screen.getByRole('button', { name: '创建账号并开始使用' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenLastCalledWith('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken,
          adminUsername: 'admin',
          adminPassword: 'admin-password-2026',
          viewerUsername: 'viewer',
          viewerPassword: 'viewer-password-2026',
        }),
      });
    });
    expect(mockLogin).toHaveBeenCalledWith('admin', 'admin-password-2026');
    expect(mockReplace).toHaveBeenCalledWith('/workspace');
  });

  it('routes to login when another request completed setup first', async () => {
    await renderFreshSetup();
    (globalThis.fetch as jest.Mock).mockImplementationOnce(() =>
      response({ error: 'ALREADY_INITIALIZED', message: '已初始化' }, 409),
    );
    const user = await fillPasswords();

    await user.click(screen.getByRole('button', { name: '创建账号并开始使用' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('falls back to login when automatic sign-in fails after setup', async () => {
    await renderFreshSetup();
    (globalThis.fetch as jest.Mock).mockImplementationOnce(() =>
      response({ initialized: true }, 201),
    );
    mockLogin.mockRejectedValueOnce(new Error('temporary login failure'));
    const user = await fillPasswords();

    await act(async () => {
      await user.click(
        screen.getByRole('button', { name: '创建账号并开始使用' }),
      );
    });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });
});
