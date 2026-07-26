/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/login/page';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockLogin = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

jest.mock('@/components/shared/AuthProvider', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
  }),
}));

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

describe('LoginPage credential hint', () => {
  afterEach(() => {
    jest.clearAllMocks();
    setNodeEnv(originalNodeEnv ?? 'test');
  });

  it('does not expose seeded credentials in production', () => {
    setNodeEnv('production');

    render(<LoginPage />);

    expect(screen.queryByText(/admin123/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('shows the seeded account hint during local development', () => {
    setNodeEnv('development');

    render(<LoginPage />);

    expect(screen.getByText('本地开发账号：admin / admin123')).toBeInTheDocument();
  });
});
