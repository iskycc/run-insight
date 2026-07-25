'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { AssetDetail } from '@/components/assets/AssetDetail';
import { AssetList } from '@/components/assets/AssetList';
import { Input } from '@/components/shared/Input';
import { Select } from '@/components/shared/Select';
import { useAuth } from '@/components/shared/AuthProvider';
import { ApiError, fetchJson } from '@/lib/fetch';
import type {
  AssetDTO,
  AssetsResponse,
  ProjectsResponse,
  RootCauseCategoriesResponse,
  RootCauseCategoryDTO,
} from '@/types';

export default function AssetsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<RootCauseCategoryDTO[]>([]);
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [rootCauseCategoryId, setRootCauseCategoryId] = useState('');
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetDTO | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pageSize = 20;

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    void fetchJson<ProjectsResponse>('/api/projects').then((data) => {
      setProjects(data.projects.map(({ id, name }) => ({ id, name })));
    }).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    void fetchJson<RootCauseCategoriesResponse>(
      `/api/root-cause-categories${query}`
    ).then((data) => {
      setCategories(data.categories);
      setRootCauseCategoryId('');
    }).catch(() => setCategories([]));
  }, [projectId, user]);

  const loadAssets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (projectId) query.set('projectId', projectId);
      if (status) query.set('status', status);
      if (rootCauseCategoryId) query.set('rootCauseCategoryId', rootCauseCategoryId);
      if (tag.trim()) query.set('tag', tag.trim());
      if (search.trim()) query.set('search', search.trim());
      const data = await fetchJson<AssetsResponse>(`/api/assets?${query}`);
      setAssets(data.assets);
      setTotal(data.total);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '加载资产失败');
    } finally {
      setLoading(false);
    }
  }, [page, projectId, rootCauseCategoryId, search, status, tag, user]);

  useEffect(() => {
    queueMicrotask(() => void loadAssets());
  }, [loadAssets]);

  const openAsset = async (id: string) => {
    try {
      const data = await fetchJson<{ asset: AssetDTO }>(`/api/assets/${id}`);
      setSelectedAsset(data.asset);
      setAssets((current) =>
        current.map((asset) => asset.id === id ? data.asset : asset)
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '加载资产详情失败');
    }
  };

  const filterChanged = () => {
    setPage(1);
    setSelectedAsset(null);
  };

  return (
    <PageContainer title="资产库" subtitle="可维护、发布和复用的分析知识">
      <div className="panel mb-lg grid gap-md p-md sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label="项目"
          value={projectId}
          placeholder="全部项目"
          options={projects.map((project) => ({ value: project.id, label: project.name }))}
          onChange={(event) => { filterChanged(); setProjectId(event.target.value); }}
        />
        <Select
          label="状态"
          value={status}
          placeholder="全部状态"
          options={[
            { value: 'DRAFT', label: '草稿' },
            { value: 'PUBLISHED', label: '已发布' },
            { value: 'ARCHIVED', label: '已归档' },
          ]}
          onChange={(event) => { filterChanged(); setStatus(event.target.value); }}
        />
        <Select
          label="根因分类"
          value={rootCauseCategoryId}
          placeholder="全部分类"
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
          onChange={(event) => { filterChanged(); setRootCauseCategoryId(event.target.value); }}
        />
        <Input
          label="标签"
          value={tag}
          placeholder="精确标签"
          onChange={(event) => { filterChanged(); setTag(event.target.value); }}
        />
        <Input
          label="全文搜索"
          value={search}
          placeholder="标题、摘要、方案、用例"
          onChange={(event) => { filterChanged(); setSearch(event.target.value); }}
        />
      </div>

      {error && <p className="mb-md rounded bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {selectedAsset ? (
        <AssetDetail
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onUpdated={(updated) => {
            setSelectedAsset(updated);
            setAssets((current) =>
              current.map((asset) => asset.id === updated.id ? updated : asset)
            );
          }}
        />
      ) : loading ? (
        <div className="panel p-xl text-center text-sm text-text-secondary">加载中…</div>
      ) : (
        <AssetList
          assets={assets}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onSelect={(id) => void openAsset(id)}
        />
      )}
      <p className="mt-md text-xs text-text-secondary">共 {total} 条资产</p>
    </PageContainer>
  );
}
