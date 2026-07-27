/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseSelectOption } from '../../test-utils/select';
import { useParams } from 'next/navigation';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/components/shared/AuthProvider';
import ProjectSettingsPage from '@/app/projects/[id]/settings/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useParams: jest.fn(),
}));

const mockedUseParams = useParams as jest.Mock;

const originalFetch = globalThis.fetch;

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => body,
  } as Response);
}

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <ToastProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ToastProvider>
  );
}

describe('ProjectSettingsPage', () => {
  beforeEach(() => {
    mockedUseParams.mockReturnValue({ id: 'proj-1' });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn();
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('shows a login prompt when user is not authenticated', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      mockJsonResponse({ user: null })
    );

    renderWithProviders(<ProjectSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('请先登录以访问项目设置')
      ).toBeInTheDocument();
    });
  });

  it('renders project info and API keys section for ADMIN user', async () => {
    const adminUser = {
      id: 'u-1',
      username: 'admin',
      role: 'ADMIN',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const projects = {
      projects: [
        {
          id: 'proj-1',
          name: 'Demo Project',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          archived: false,
          stageCount: 3,
          caseCount: 12,
          passCount: 8,
          failCount: 2,
          canAdmin: true,
        },
      ],
    };
    const apiKeys = {
      keys: [
        {
          id: 'key-1',
          prefix: 'ri_demo123',
          description: 'CI key',
          scopes: ['IMPORT'],
          status: 'ACTIVE',
          expiresAt: '2026-12-01T00:00:00.000Z',
          revokedAt: null,
          lastUsedAt: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    };

    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return mockJsonResponse({ user: adminUser });
      if (url.includes('/api/projects/proj-1/api-keys'))
        return mockJsonResponse(apiKeys);
      if (url.includes('/api/projects')) return mockJsonResponse(projects);
      return mockJsonResponse({}, false, 404);
    });

    renderWithProviders(<ProjectSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Demo Project')).toBeInTheDocument();
    });

    expect(screen.getByText('API Key')).toBeInTheDocument();
    expect(await screen.findByText('CI key')).toBeInTheDocument();
    expect(screen.getByText('ri_demo123••••')).toBeInTheDocument();
    expect(screen.getByText('有效')).toBeInTheDocument();
    expect(screen.getByText('从未使用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建 API Key' })).toBeInTheDocument();
  });

  it('creates an IMPORT-scoped key with an expiry and shows the raw key once', async () => {
    const user = userEvent.setup();
    const adminUser = {
      id: 'u-1',
      username: 'admin',
      role: 'ADMIN',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const projects = {
      projects: [
        {
          id: 'proj-1',
          name: 'Demo Project',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          archived: false,
          stageCount: 1,
          caseCount: 0,
          passCount: 0,
          failCount: 0,
          canAdmin: true,
        },
      ],
    };
    const issued = {
      id: 'key-new',
      key: 'ri_example-raw-secret',
      prefix: 'ri_example',
      description: 'CI pipeline',
      scopes: ['IMPORT'],
      status: 'ACTIVE',
      expiresAt: '2026-10-01T00:00:00.000Z',
      revokedAt: null,
      lastUsedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    (globalThis.fetch as jest.Mock).mockImplementation(
      (url: string, init?: RequestInit) => {
        if (url.includes('/api/auth/me')) {
          return mockJsonResponse({ user: adminUser });
        }
        if (url.includes('/api/projects/proj-1/api-keys')) {
          if (init?.method === 'POST') return mockJsonResponse(issued, true, 201);
          return mockJsonResponse({ keys: [] });
        }
        if (url.includes('/api/projects')) return mockJsonResponse(projects);
        return mockJsonResponse({}, false, 404);
      }
    );

    renderWithProviders(<ProjectSettingsPage />);
    await screen.findByText('Demo Project');
    await user.click(screen.getByRole('button', { name: '创建 API Key' }));
    await user.type(screen.getByRole('textbox', { name: '描述' }), 'CI pipeline');
    await chooseSelectOption(
      user,
      screen.getByRole('combobox', { name: '有效期' }),
      '30 天',
    );
    await user.click(screen.getByRole('button', { name: '创建' }));

    expect(await screen.findByText('API Key 已创建')).toBeInTheDocument();
    expect(screen.getByTestId('issued-key')).toHaveTextContent(
      'ri_example-raw-secret'
    );
    const createCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url, init]: [string, RequestInit | undefined]) =>
        url.includes('/api/projects/proj-1/api-keys') && init?.method === 'POST'
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse(String(createCall?.[1]?.body)) as {
      description: string;
      scopes: string[];
      expiresAt: string;
    };
    expect(body.description).toBe('CI pipeline');
    expect(body.scopes).toEqual(['IMPORT']);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('hides API Key controls for non-ADMIN users', async () => {
    const viewerUser = {
      id: 'u-2',
      username: 'viewer',
      role: 'VIEWER',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const projects = {
      projects: [
        {
          id: 'proj-1',
          name: 'Demo Project',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          archived: false,
          stageCount: 0,
          caseCount: 0,
          passCount: 0,
          failCount: 0,
          canAdmin: false,
        },
      ],
    };

    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me'))
        return mockJsonResponse({ user: viewerUser });
      if (url.includes('/api/projects')) return mockJsonResponse(projects);
      return mockJsonResponse({}, false, 404);
    });

    renderWithProviders(<ProjectSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Demo Project')).toBeInTheDocument();
    });

    expect(
      screen.getByText('API Key 管理仅对管理员开放')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '创建 API Key' })
    ).not.toBeInTheDocument();
  });
});
