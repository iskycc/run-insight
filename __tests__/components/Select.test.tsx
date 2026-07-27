/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '@/components/shared/Select';

const options = [
  { value: 'all', label: '全部项目' },
  { value: 'alpha', label: 'Alpha 项目' },
  { value: 'disabled', label: '不可选择', disabled: true },
];

describe('Select', () => {
  it('renders a custom listbox and reports the selected value', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(
      <Select
        label="项目"
        value="all"
        options={options}
        onChange={handleChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: '项目' });
    expect(trigger).toHaveTextContent('全部项目');
    expect(document.querySelector('select')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('listbox', { name: '项目' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Alpha 项目' }));

    expect(handleChange).toHaveBeenCalledWith({
      target: { value: 'alpha' },
      currentTarget: { value: 'alpha' },
    });
    expect(screen.queryByRole('listbox', { name: '项目' })).not.toBeInTheDocument();
  });

  it('supports keyboard selection and ignores disabled options', async () => {
    const user = userEvent.setup();
    const handleValueChange = jest.fn();

    render(
      <Select
        aria-label="状态"
        defaultValue="all"
        options={options}
        onValueChange={handleValueChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: '状态' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(handleValueChange).toHaveBeenCalledWith('alpha');
    expect(trigger).toHaveTextContent('Alpha 项目');
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="禁用选择" disabled options={options} value="all" />);

    const trigger = screen.getByRole('combobox', { name: '禁用选择' });
    await user.click(trigger);

    expect(trigger).toBeDisabled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
