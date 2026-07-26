/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetricCards from '@/components/workspace/MetricCards';

const mockMetrics = {
  totalCaseCount: 100,
  failedCaseCount: 25,
  pendingCount: 10,
  analyzedCount: 80,
  assetCount: 45,
};

describe('MetricCards', () => {
  test('renders all metric values', () => {
    render(<MetricCards metrics={mockMetrics} />);

    // MetricCards uses data-metric attributes on wrapper divs
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.queryByText('较昨日')).not.toBeInTheDocument();
    expect(screen.queryByText(/今天有/)).not.toBeInTheDocument();
  });

  test('opens the real pending filter action when requested', async () => {
    const onContinue = jest.fn();
    render(<MetricCards metrics={mockMetrics} onContinue={onContinue} />);

    await userEvent.setup().click(
      screen.getByRole('button', { name: '查看待分析用例' }),
    );

    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
