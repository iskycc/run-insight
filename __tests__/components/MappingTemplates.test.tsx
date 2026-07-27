/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseSelectOption } from '../../test-utils/select';
import MappingTemplates from '@/components/import/MappingTemplates';
import type { ImportMappingTemplateDTO } from '@/types';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const storedTemplate: ImportMappingTemplateDTO = {
  id: 'template_1',
  ownerId: 'user_1',
  ownerName: 'alice',
  projectId: null,
  name: '标准 CSV',
  importType: 'pre-analysis',
  mapping: { caseNo: '编号', name: '名称' },
  scope: 'PERSONAL',
  isOwner: true,
  canManage: true,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

describe('MappingTemplates', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('uses the server as source of truth for save, apply, update and delete', async () => {
    let templates: ImportMappingTemplateDTO[] = [];
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/import-mapping-templates?')) {
        return jsonResponse({ templates, canShare: false });
      }
      if (url === '/api/import-mapping-templates' && init?.method === 'POST') {
        templates = [storedTemplate];
        return jsonResponse({ template: storedTemplate }, 201);
      }
      if (
        url === '/api/import-mapping-templates/template_1'
        && init?.method === 'PATCH'
      ) {
        return jsonResponse({ template: storedTemplate });
      }
      if (
        url === '/api/import-mapping-templates/template_1'
        && init?.method === 'DELETE'
      ) {
        templates = [];
        return jsonResponse({ deleted: true });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    globalThis.fetch = fetchMock;
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const onApply = jest.fn();
    const user = userEvent.setup();
    render(
      <MappingTemplates
        importType="pre-analysis"
        projectId=""
        headers={['编号']}
        mapping={{ caseNo: '编号', name: '名称' }}
        onApply={onApply}
      />,
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/import-mapping-templates?importType=pre-analysis',
        undefined,
      ),
    );
    await user.type(screen.getByLabelText('映射模板名称'), '标准 CSV');
    await user.click(screen.getByRole('button', { name: '保存模板' }));

    expect(await screen.findByText('模板已保存到账号')).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      name: '标准 CSV',
      importType: 'pre-analysis',
      mapping: { caseNo: '编号', name: '名称' },
      scope: 'PERSONAL',
    });

    await chooseSelectOption(user, screen.getByLabelText('已保存映射模板'), '标准 CSV');
    await user.click(screen.getByRole('button', { name: '应用' }));
    expect(onApply).toHaveBeenCalledWith({ caseNo: '编号' });

    await user.click(screen.getByRole('button', { name: '更新' }));
    expect(await screen.findByText('模板已更新为当前映射')).toBeInTheDocument();

    await chooseSelectOption(user, screen.getByLabelText('已保存映射模板'), '标准 CSV');
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(await screen.findByText('模板已删除')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '标准 CSV' })).not.toBeInTheDocument();
  });

  it('offers project sharing only when the server grants permission', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({ template: storedTemplate }, 201);
      }
      return jsonResponse({ templates: [], canShare: true });
    });
    const user = userEvent.setup();
    render(
      <MappingTemplates
        importType="post-analysis"
        projectId="project_1"
        headers={['负责人']}
        mapping={{ assignee: '负责人' }}
        onApply={jest.fn()}
      />,
    );

    await chooseSelectOption(user, screen.getByLabelText('模板范围'), '项目共享');
    expect(screen.getByLabelText('模板范围')).toHaveTextContent('项目共享');
    await user.type(screen.getByLabelText('映射模板名称'), '项目分析模板');
    await user.click(screen.getByRole('button', { name: '保存模板' }));

    const postCall = await waitFor(() => {
      const call = (globalThis.fetch as jest.Mock).mock.calls.find(
        ([, init]: [RequestInfo | URL, RequestInit | undefined]) =>
          init?.method === 'POST',
      );
      expect(call).toBeDefined();
      return call;
    });
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        scope: 'PROJECT',
        projectId: 'project_1',
      }),
    );
  });

  it('imports legacy local templates once and removes local data on success', async () => {
    window.localStorage.setItem(
      'run-insight:import-mapping-templates:pre-analysis',
      JSON.stringify([
        { name: '旧模板', mapping: { caseNo: '编号' } },
      ]),
    );
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({ template: storedTemplate }, 201);
      }
      return jsonResponse({ templates: [], canShare: false });
    });
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    render(
      <MappingTemplates
        importType="pre-analysis"
        projectId=""
        headers={['编号']}
        mapping={{ caseNo: '编号' }}
        onApply={jest.fn()}
      />,
    );

    expect(await screen.findByText(/检测到 1 个本机旧模板/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导入旧模板' }));

    await waitFor(() => {
      expect(
        window.localStorage.getItem(
          'run-insight:import-mapping-templates:migrated:pre-analysis',
        ),
      ).toBe('1');
    });
    expect(
      window.localStorage.getItem(
        'run-insight:import-mapping-templates:pre-analysis',
      ),
    ).toBeNull();
  });
});
