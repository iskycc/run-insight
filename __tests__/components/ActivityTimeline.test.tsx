/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityTimeline } from '@/components/case/ActivityTimeline';
import type { CaseActivityDTO } from '@/types';

const managedComment: CaseActivityDTO = {
  id: 'comment-1',
  type: 'COMMENT',
  changes: null,
  comment: '原评论',
  user: { id: 'u1', username: 'alice' },
  createdAt: '2026-07-25T00:00:00.000Z',
  canManage: true,
};

const defaults = {
  activities: [managedComment],
  canComment: true,
  comment: '',
  commenting: false,
  error: '',
  onCommentChange: jest.fn(),
  onSubmitComment: jest.fn(),
  onEditComment: jest.fn().mockResolvedValue(true),
  onDeleteComment: jest.fn().mockResolvedValue(true),
};

describe('ActivityTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only shows management actions for manageable comments', () => {
    const activities: CaseActivityDTO[] = [
      managedComment,
      {
        ...managedComment,
        id: 'comment-2',
        comment: '其他评论',
        canManage: false,
      },
      {
        ...managedComment,
        id: 'update-1',
        type: 'UPDATED',
        comment: null,
        changes: { rootCause: { from: null, to: '超时' } },
        canManage: true,
      },
    ];

    render(<ActivityTimeline {...defaults} activities={activities} />);

    expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '删除' })).toHaveLength(1);
    expect(screen.getByText('更新了分析信息')).toBeInTheDocument();
  });

  it('edits a comment inline and trims the submitted value', async () => {
    const user = userEvent.setup();
    const onEditComment = jest.fn().mockResolvedValue(true);
    render(
      <ActivityTimeline
        {...defaults}
        onEditComment={onEditComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: '编辑' }));
    const editor = screen.getByRole('textbox', { name: '编辑评论' });
    await user.clear(editor);
    await user.type(editor, '  修改后的评论  ');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(onEditComment).toHaveBeenCalledWith('comment-1', '修改后的评论');
    });
    expect(screen.queryByRole('textbox', { name: '编辑评论' })).not.toBeInTheDocument();
  });

  it('requires confirmation before deleting a comment', async () => {
    const user = userEvent.setup();
    const onDeleteComment = jest.fn().mockResolvedValue(true);
    const confirmSpy = jest.spyOn(window, 'confirm');
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(
      <ActivityTimeline
        {...defaults}
        onDeleteComment={onDeleteComment}
      />,
    );

    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(onDeleteComment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => {
      expect(onDeleteComment).toHaveBeenCalledWith('comment-1');
    });
    confirmSpy.mockRestore();
  });

  it('submits new comments and supports cancelling an inline edit', async () => {
    const user = userEvent.setup();
    const onCommentChange = jest.fn();
    const onSubmitComment = jest.fn();
    const { rerender } = render(
      <ActivityTimeline
        {...defaults}
        onCommentChange={onCommentChange}
        onSubmitComment={onSubmitComment}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '发表评论' }), {
      target: { value: '新评论' },
    });
    expect(onCommentChange).toHaveBeenCalledWith('新评论');

    rerender(
      <ActivityTimeline
        {...defaults}
        comment="新评论"
        onCommentChange={onCommentChange}
        onSubmitComment={onSubmitComment}
      />,
    );
    await user.click(screen.getByRole('button', { name: '发表评论' }));
    expect(onSubmitComment).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByRole('textbox', { name: '编辑评论' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('textbox', { name: '编辑评论' })).not.toBeInTheDocument();
  });

  it('labels created activities and renders an empty timeline', () => {
    const { rerender } = render(
      <ActivityTimeline
        {...defaults}
        activities={[{
          ...managedComment,
          id: 'created-1',
          type: 'CREATED',
          comment: null,
          canManage: false,
        }]}
      />,
    );
    expect(screen.getByText('创建了用例')).toBeInTheDocument();

    rerender(<ActivityTimeline {...defaults} activities={[]} />);
    expect(screen.getByText('暂无分析动态')).toBeInTheDocument();
  });

  it('keeps viewers read-only and displays API errors', () => {
    render(
      <ActivityTimeline
        {...defaults}
        canComment={false}
        activities={[{ ...managedComment, canManage: false }]}
        error="仅评论作者可以编辑"
      />,
    );

    expect(screen.queryByRole('textbox', { name: '发表评论' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('仅评论作者可以编辑');
  });

  it('suggests project members and inserts a selected mention', async () => {
    const user = userEvent.setup();
    const onCommentChange = jest.fn();
    render(
      <ActivityTimeline
        {...defaults}
        comment="请 @al"
        mentionUsernames={['alice', 'alex', 'bob']}
        onCommentChange={onCommentChange}
      />,
    );

    expect(
      screen.getByRole('listbox', { name: '可提及的项目成员' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '@alice' }));
    expect(onCommentChange).toHaveBeenCalledWith('请 @alice ');
  });
});
