import type { ReactNode } from 'react';
import { PlatformManagementShell } from '@/components/layout/PlatformManagementShell';

export default function AssigneeReportLayout({ children }: { children: ReactNode }) {
  return <PlatformManagementShell>{children}</PlatformManagementShell>;
}
