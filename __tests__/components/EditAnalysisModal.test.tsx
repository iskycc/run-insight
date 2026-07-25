/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditAnalysisModal } from '@/components/case/EditAnalysisModal';

describe('EditAnalysisModal', () => {
  it('edits and submits notes with the other analysis fields', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    render(
      <EditAnalysisModal
        open
        onClose={jest.fn()}
        onSave={onSave}
        initialData={{
          assignee: 'alice',
          progressCategory: 'LOCATED',
          rootCause: '超时',
          mrOrTicket: 'BUG-1',
          notes: '旧备注',
        }}
      />,
    );

    const notes = screen.getByLabelText('备注');
    await user.clear(notes);
    await user.type(notes, '新的分析结论');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSave).toHaveBeenCalledWith({
      assignee: 'alice',
      progressCategory: 'LOCATED',
      rootCause: '超时',
      rootCauseCategoryId: null,
      mrOrTicket: 'BUG-1',
      notes: '新的分析结论',
    });
  });
});
