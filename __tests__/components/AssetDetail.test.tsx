/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetDetail } from '@/components/assets/AssetDetail';
import type { AssetDTO } from '@/types';

const mockFetchJson = jest.fn();

jest.mock('@/lib/fetch', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
  ApiError: class ApiError extends Error {},
}));

const asset: AssetDTO = {
  id: 'asset-1',
  sourceCaseId: null,
  projectId: 'project-1',
  rootCauseCategoryId: null,
  title: '登录失败分析',
  summary: '新摘要',
  solution: '修复空值处理',
  rootCauseText: '空指针',
  tags: ['登录'],
  status: 'REVIEW',
  version: 2,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  viewCount: 3,
  reuseCount: 1,
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T01:00:00.000Z',
  canEdit: true,
  canReview: true,
  project: { id: 'project-1', name: '项目一' },
  rootCauseCategory: null,
  sourceCase: null,
  creator: { username: 'editor' },
  updater: { username: 'editor' },
};

const versions = [
  {
    id: 'version-2',
    assetId: 'asset-1',
    version: 2,
    title: '登录失败分析',
    summary: '新摘要',
    solution: '修复空值处理',
    rootCauseText: '空指针',
    tags: ['登录'],
    status: 'REVIEW',
    changedBy: 'user-1',
    author: { username: 'editor' },
    createdAt: '2026-07-27T01:00:00.000Z',
  },
  {
    id: 'version-1',
    assetId: 'asset-1',
    version: 1,
    title: '登录失败分析',
    summary: '旧摘要',
    solution: '修复空值处理',
    rootCauseText: '空指针',
    tags: ['登录'],
    status: 'DRAFT',
    changedBy: 'user-1',
    author: { username: 'editor' },
    createdAt: '2026-07-27T00:00:00.000Z',
  },
];

describe('AssetDetail lifecycle UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchJson.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith('/api/root-cause-categories')) {
        return Promise.resolve({ categories: [], canManage: false });
      }
      if (url === '/api/assets/asset-1/versions') {
        return Promise.resolve({ versions, canRollback: true });
      }
      if (url === '/api/assets/asset-1/versions/1') {
        return Promise.resolve({
          version: versions[1],
          compareTo: null,
          changes: [],
          canRollback: true,
        });
      }
      if (url === '/api/assets/asset-1' && init?.method === 'PATCH') {
        return Promise.resolve({
          asset: { ...asset, status: 'PUBLISHED', version: 3 },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  it('shows reviewer actions and immutable version history', async () => {
    const onUpdated = jest.fn();
    const user = userEvent.setup();
    render(
      <AssetDetail asset={asset} onClose={jest.fn()} onUpdated={onUpdated} />,
    );

    expect(screen.getByRole('button', { name: '发布' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '驳回' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(await screen.findByText('版本历史')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /v1/ }));
    expect(await screen.findByText(/v1 · 基线版本/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复此版本' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '发布' }));
    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith('/api/assets/asset-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PUBLISHED' }),
      });
    });
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PUBLISHED', version: 3 }),
    );
  });

  it('does not expose editing, review, or historical drafts to viewers', async () => {
    render(
      <AssetDetail
        asset={{
          ...asset,
          status: 'PUBLISHED',
          canEdit: false,
          canReview: false,
        }}
        onClose={jest.fn()}
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.queryByText('版本历史')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发布' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        '/api/root-cause-categories?projectId=project-1',
      );
    });
  });
});
