'use client';

import type { ReactNode } from 'react';
import { Buildings } from '@phosphor-icons/react';
import { SecondaryNav } from '@/components/layout/SecondaryNav';

const NAV_ITEMS = [
  {
    href: '/organizations/settings',
    label: '组织设置',
    icon: Buildings,
  },
] as const;

export default function OrganizationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-0 pt-5">
      <SecondaryNav
        title="组织管理"
        subtitle="管理当前组织及其成员"
        items={NAV_ITEMS}
      />
      <div>{children}</div>
    </div>
  );
}
