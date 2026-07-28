/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '@/components/shared/Checkbox';
import { Input } from '@/components/shared/Input';
import { LoadingState } from '@/components/shared/LoadingState';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { Switch } from '@/components/shared/Switch';
import { Textarea } from '@/components/shared/Textarea';

describe('shared form and feedback controls', () => {
  it('uses a custom checkbox visual while preserving native semantics', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Checkbox label="启用通知" onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: '启用通知' });
    await user.click(checkbox);

    expect(onChange).toHaveBeenCalled();
    expect(checkbox).toBeChecked();
  });

  it('supports indeterminate selection and custom switches', async () => {
    const user = userEvent.setup();
    const onCheckedChange = jest.fn();
    render(
      <>
        <Checkbox aria-label="选择全部" indeterminate />
        <Switch
          checked={false}
          onCheckedChange={onCheckedChange}
          label="目录登录"
        />
      </>,
    );

    expect(screen.getByRole('checkbox', { name: '选择全部' })).toHaveProperty(
      'indeterminate',
      true,
    );
    await user.click(screen.getByRole('switch', { name: '目录登录' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('renders date and time fields without browser-native picker controls', () => {
    render(
      <>
        <Input label="日期" type="date" />
        <Input label="时间" type="time" />
        <Textarea label="说明" />
      </>,
    );

    expect(screen.getByLabelText('日期')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('日期')).toHaveAttribute('placeholder', 'YYYY-MM-DD');
    expect(screen.getByLabelText('时间')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('说明')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('announces loading and progress states', () => {
    render(
      <>
        <LoadingState label="正在加载数据" />
        <ProgressBar label="导入进度" value={42} />
      </>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('正在加载数据');
    expect(screen.getByRole('progressbar', { name: '导入进度' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
  });
});
