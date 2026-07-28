/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { AppFrame } from '@/components/layout/AppFrame';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/components/layout/Header', () => ({
  Header: () => <div>app-header</div>,
}));

jest.mock('@/components/layout/Nav', () => ({
  Nav: () => <div>app-navigation</div>,
}));

const mockedUsePathname = usePathname as jest.Mock;

describe('AppFrame', () => {
  it.each(['/login', '/setup'])('keeps %s focused without duplicate app chrome', (pathname) => {
    mockedUsePathname.mockReturnValue(pathname);

    render(
      <AppFrame>
        <div>standalone-content</div>
      </AppFrame>,
    );

    expect(screen.queryByText('app-header')).not.toBeInTheDocument();
    expect(screen.queryByText('app-navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('min-h-screen');
    expect(screen.getByRole('main')).toHaveClass('route-motion-auth');
    expect(screen.getByText('standalone-content')).toBeInTheDocument();
  });

  it('keeps the shared chrome on application pages', () => {
    mockedUsePathname.mockReturnValue('/workspace');

    render(
      <AppFrame>
        <div>workspace-content</div>
      </AppFrame>,
    );

    expect(screen.getByText('app-header')).toBeInTheDocument();
    expect(screen.getByText('app-navigation')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('min-h-[calc(100vh-86px)]');
    expect(screen.getByRole('main')).toHaveClass('route-motion-overview');
  });

  it.each([
    ['/import', 'route-motion-flow'],
    ['/admin/users', 'route-motion-manage'],
    ['/case/case-1', 'route-motion-detail'],
    ['/reports/assignee', 'route-motion-report'],
  ])('uses contextual motion for %s', (pathname, motionClass) => {
    mockedUsePathname.mockReturnValue(pathname);

    render(<AppFrame><div>content</div></AppFrame>);

    expect(screen.getByRole('main')).toHaveClass(motionClass);
  });
});
