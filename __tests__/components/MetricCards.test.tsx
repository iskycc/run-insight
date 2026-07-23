/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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
  });
});
