/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { CaseDetail, type CaseDetailData } from '@/components/case/CaseDetail';

const caseData: CaseDetailData = {
  id: 'case-1',
  caseNo: 'C001',
  name: '登录用例',
  resultSummary: 'FAIL',
  logUrl: null,
  projectId: 'project-1',
  testStageId: 'stage-1',
  batchScopeId: 'batch-1',
  assignee: 'alice',
  progressCategory: 'FIXED',
  rootCause: '代码缺陷',
  mrOrTicket: null,
  notes: null,
  assetSaved: false,
  updatedBy: null,
  updatedByUsername: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  project: { id: 'project-1', name: '示例项目' },
  stage: { id: 'stage-1', name: '系统测试' },
  batchScope: { id: 'batch-1', name: '第一轮' },
};

describe('CaseDetail', () => {
  it('shows analysis write actions for editors', () => {
    render(
      <CaseDetail
        canEdit
        caseData={caseData}
        onEdit={jest.fn()}
        onSaveAsset={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '编辑分析' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存为资产' })).toBeInTheDocument();
  });

  it('keeps case information visible but hides write actions for viewers', () => {
    render(
      <CaseDetail
        canEdit={false}
        caseData={caseData}
        onEdit={jest.fn()}
        onSaveAsset={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: '登录用例' })).toBeInTheDocument();
    expect(screen.getByText('代码缺陷')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑分析' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存为资产' })).not.toBeInTheDocument();
  });

  it('still displays the saved asset status in read-only mode', () => {
    render(
      <CaseDetail
        canEdit={false}
        caseData={{ ...caseData, assetSaved: true }}
        onEdit={jest.fn()}
        onSaveAsset={jest.fn()}
      />,
    );

    expect(screen.getByText('已保存资产')).toBeInTheDocument();
  });

  it('displays notes and the latest updater', () => {
    render(
      <CaseDetail
        canEdit={false}
        caseData={{ ...caseData, notes: '已确认是缓存失效问题' }}
        onEdit={jest.fn()}
        onSaveAsset={jest.fn()}
      />,
    );

    expect(screen.getByText('已确认是缓存失效问题')).toBeInTheDocument();
    expect(screen.getByText('最近更新人 admin')).toBeInTheDocument();
  });
});
