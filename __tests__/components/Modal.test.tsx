/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Modal } from '@/components/shared/Modal';

describe('Modal', () => {
  it('keeps long content and footer actions within a narrow viewport', () => {
    render(
      <Modal
        open
        onClose={jest.fn()}
        title="响应式弹窗"
        footer={
          <>
            <button type="button">取消</button>
            <button type="button">确认操作</button>
          </>
        }
      >
        <p>弹窗内容</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: '响应式弹窗' });
    expect(dialog).toHaveClass(
      'flex',
      'max-h-[calc(100dvh-2rem)]',
      'flex-col',
      'overflow-hidden',
    );
    expect(screen.getByText('弹窗内容').parentElement).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
    );
    expect(screen.getByRole('button', { name: '取消' }).parentElement).toHaveClass(
      'flex-wrap',
      'shrink-0',
    );
  });
});
