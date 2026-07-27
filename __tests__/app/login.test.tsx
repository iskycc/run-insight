/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
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

const originalFetch = globalThis.fetch;

describe('LoginPage', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ initialized: true }),
      } as Response),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it('renders the login form without exposing demo credentials', () => {
    render(<LoginPage />);

    expect(screen.queryByText(/admin123/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('redirects a fresh instance to the setup guide', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ initialized: false }),
    });

    render(<LoginPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/setup'));
  });
});
