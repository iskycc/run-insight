/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import OrganizationsLayout from '@/app/organizations/layout';

jest.mock('next/navigation', () => ({
  usePathname: () => '/organizations/settings',
}));

describe('OrganizationsLayout', () => {
  it('uses the same secondary navigation shell as platform management', () => {
    render(
      <OrganizationsLayout>
        <div>organization-content</div>
      </OrganizationsLayout>,
    );

    const organizationTabs = screen.getByText('组织管理').closest('header');
    expect(organizationTabs).toHaveClass(
      'xl:w-[calc(100%-2.5rem)]',
      'xl:max-w-[1280px]',
    );

    const navigation = screen.getByRole('navigation', { name: '组织管理导航' });
    expect(navigation).toHaveClass('flex', 'w-full', 'sm:w-auto');

    const settingsLink = screen.getByRole('link', { name: '组织设置' });
    expect(settingsLink).toHaveAttribute('href', '/organizations/settings');
    expect(settingsLink).toHaveAttribute('aria-current', 'page');
    expect(settingsLink).toHaveClass('flex-1', 'sm:flex-none');
    expect(screen.getByText('organization-content')).toBeInTheDocument();
  });
});
