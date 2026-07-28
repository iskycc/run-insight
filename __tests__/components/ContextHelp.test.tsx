/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { ContextHelp, getHelpContent } from '@/components/shared/ContextHelp';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

const mockedUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe('ContextHelp', () => {
  it('provides specific instructions for every route family', () => {
    expect(getHelpContent('/import').title).toBe('数据导入');
    expect(getHelpContent('/admin/ldap').title).toBe('LDAP 配置');
    expect(getHelpContent('/projects/project-1/members').title).toBe('项目成员');
    expect(getHelpContent('/case/case-1').title).toBe('用例详情');
    expect(getHelpContent('/unknown').title).toBe('页面使用帮助');
  });

  it('opens and closes an accessible help panel', () => {
    mockedUsePathname.mockReturnValue('/import');
    render(<ContextHelp />);

    const trigger = screen.getByRole('button', { name: '使用帮助' });
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '数据导入' })).toBeInTheDocument();
    expect(screen.getByText('选择导入类型与文件格式并下载模板')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭使用帮助' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
