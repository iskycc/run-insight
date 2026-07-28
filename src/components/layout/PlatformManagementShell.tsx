'use client';

import type { ReactNode } from 'react';
import {
  ChartBar,
  ClockCounterClockwise,
  IdentificationBadge,
  ListMagnifyingGlass,
  TreeStructure,
  Users,
} from '@phosphor-icons/react';
import { SecondaryNav } from '@/components/layout/SecondaryNav';
import { useAuth } from '@/components/shared/AuthProvider';

const REPORT_ITEMS = [
  { href: '/reports/assignee', label: '责任人报告', icon: ChartBar },
  { href: '/import-history', label: '导入历史', icon: ClockCounterClockwise },
] as const;

const ADMIN_ITEMS = [
  { href: '/admin/users', label: '用户管理', icon: Users },
  { href: '/admin/ldap', label: 'LDAP 配置', icon: IdentificationBadge },
  { href: '/admin/audit-logs', label: '审计日志', icon: ListMagnifyingGlass },
  { href: '/admin/root-causes', label: '根因分类', icon: TreeStructure },
] as const;

export function PlatformManagementShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const items = user?.role === 'ADMIN'
    ? [...ADMIN_ITEMS, ...REPORT_ITEMS]
    : REPORT_ITEMS;

  return (
    <div className="space-y-0 pt-5">
      <SecondaryNav
        title="平台管理"
        subtitle="统一管理平台账号、运行记录与分析报告"
        items={items}
      />
      <div>{children}</div>
    </div>
  );
}
