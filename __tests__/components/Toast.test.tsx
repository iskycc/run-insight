/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '@/contexts/ToastContext';
import { ToastContainer } from '@/components/shared/Toast';

function TestButton() {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => showToast({ message: '操作成功', type: 'success' })}
    >
      Show Toast
    </button>
  );
}

function renderWithProvider(ui: React.ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe('Toast system', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a toast when showToast is called', async () => {
    renderWithProvider(
      <>
        <TestButton />
        <ToastContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: /show toast/i }));
    expect(screen.getByText('操作成功')).toBeInTheDocument();
  });

  it('auto-dismisses a toast after 3 seconds', async () => {
    renderWithProvider(
      <>
        <TestButton />
        <ToastContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: /show toast/i }));
    expect(screen.getByText('操作成功')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('操作成功')).not.toBeInTheDocument();
  });

  it('dismisses a toast when close button is clicked', async () => {
    renderWithProvider(
      <>
        <TestButton />
        <ToastContainer />
      </>
    );

    await user.click(screen.getByRole('button', { name: /show toast/i }));
    await user.click(screen.getByRole('button', { name: /关闭通知/i }));

    expect(screen.queryByText('操作成功')).not.toBeInTheDocument();
  });
});
