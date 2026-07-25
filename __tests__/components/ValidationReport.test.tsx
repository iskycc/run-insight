/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValidationReport from '@/components/import/ValidationReport';

describe('ValidationReport', () => {
  it('downloads validation errors as a UTF-8 CSV', async () => {
    const createObjectURL = jest.fn().mockReturnValue('blob:validation-errors');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(
      <ValidationReport
        totalRows={2}
        errors={[
          { row: 2, field: 'caseNo', message: '编号包含,逗号' },
          { row: 3, field: 'name', message: '名称包含"引号"' },
        ]}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '下载错误 CSV' }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(csv).toContain('row,field,message');
    expect(csv).toContain('2,caseNo,"编号包含,逗号"');
    expect(csv).toContain('3,name,"名称包含""引号"""');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:validation-errors');
    click.mockRestore();
  });

  it('does not show a download action when validation passes', () => {
    render(<ValidationReport totalRows={3} errors={[]} />);

    expect(screen.getByText('校验通过')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载错误 CSV' })).not.toBeInTheDocument();
  });
});
