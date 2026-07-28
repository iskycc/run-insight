import type { ReactNode } from 'react';
import { PlatformManagementShell } from '@/components/layout/PlatformManagementShell';

export default function ImportHistoryLayout({ children }: { children: ReactNode }) {
  return <PlatformManagementShell>{children}</PlatformManagementShell>;
}
