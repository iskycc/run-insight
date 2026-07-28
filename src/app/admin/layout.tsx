'use client';

import type { ReactNode } from 'react';
import {
  IdentificationBadge,
  ListMagnifyingGlass,
  TreeStructure,
  Users,
} from '@phosphor-icons/react';
import { SecondaryNav } from '@/components/layout/SecondaryNav';

const NAV_ITEMS = [
  { href: '/admin/users', label: '用户管理', icon: Users },
  { href: '/admin/ldap', label: 'LDAP 配置', icon: IdentificationBadge },
  { href: '/admin/audit-logs', label: '审计日志', icon: ListMagnifyingGlass },
  { href: '/admin/root-causes', label: '根因分类', icon: TreeStructure },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-0 pt-5">
      <SecondaryNav
        title="平台管理"
        subtitle="仅管理员可访问"
        items={NAV_ITEMS}
      />
      <div>{children}</div>
    </div>
  );
}
