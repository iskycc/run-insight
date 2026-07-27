import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

export async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  optionName: string,
) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: optionName }));
}
