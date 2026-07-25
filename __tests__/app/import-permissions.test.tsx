/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ImportPage from '@/app/import/page';
import { useAuth } from '@/components/shared/AuthProvider';

jest.mock('@/components/shared/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('ImportPage permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not expose the import workflow to viewers', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'viewer-1', username: 'viewer', role: 'VIEWER' },
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn(),
    });

    render(<ImportPage />);

    expect(screen.getByText('导入功能不可用')).toBeInTheDocument();
    expect(screen.getByText(/当前账号为只读角色/)).toBeInTheDocument();
    expect(screen.queryByText('导入用例数据')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始导入' })).not.toBeInTheDocument();
    expect(screen.queryByText('新建项目')).not.toBeInTheDocument();
  });

  it('keeps the import workflow available to editors', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'editor-1', username: 'editor', role: 'EDITOR' },
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn(),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(() => new Promise<Response>(() => undefined));

    try {
      render(<ImportPage />);

      expect(screen.getByRole('heading', { name: '导入用例数据' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '下一步' })).toBeInTheDocument();
      expect(screen.queryByText('导入功能不可用')).not.toBeInTheDocument();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
