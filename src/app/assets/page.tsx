'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { AssetDetail } from '@/components/assets/AssetDetail';
import { AssetList } from '@/components/assets/AssetList';
import { Input } from '@/components/shared/Input';
import { Select } from '@/components/shared/Select';
import { Button } from '@/components/shared/Button';
import { useAuth } from '@/components/shared/AuthProvider';
import { ApiError, fetchJson } from '@/lib/fetch';
import { FunnelSimple } from '@phosphor-icons/react';
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
      let openedAsset = data.asset;
      const viewStorageKey = `run-insight:asset-view:${id}`;
      const lastViewedAt = Number(
        window.sessionStorage.getItem(viewStorageKey) ?? '0'
      );
      if (Date.now() - lastViewedAt >= 10 * 60 * 1000) {
        window.sessionStorage.setItem(viewStorageKey, String(Date.now()));
        try {
          const view = await fetchJson<{ viewCount: number }>(
            `/api/assets/${id}/view`,
            { method: 'POST' }
          );
          openedAsset = { ...openedAsset, viewCount: view.viewCount };
        } catch {
          window.sessionStorage.removeItem(viewStorageKey);
        }
      }
      setSelectedAsset(openedAsset);
      setAssets((current) =>
        current.map((asset) => asset.id === id ? openedAsset : asset)
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
    <PageContainer title="资产库" subtitle="沉淀可维护、可发布、可持续复用的分析知识">
      <section className="bento-panel mb-5 p-4 sm:p-5" aria-label="资产筛选">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_auto] md:items-end">
          <Input
            label="搜索"
            type="search"
            value={search}
            placeholder="搜索标题、摘要、方案或用例"
            onChange={(event) => { filterChanged(); setSearch(event.target.value); }}
          />
          <Select
            label="项目"
            value={projectId}
            placeholder="全部项目"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            onChange={(event) => { filterChanged(); setProjectId(event.target.value); }}
          />
          <Button
            variant="secondary"
            onClick={() => setShowAdvancedFilters((current) => !current)}
            aria-expanded={showAdvancedFilters}
          >
            <FunnelSimple size={17} aria-hidden="true" />
            {showAdvancedFilters ? '收起筛选' : '更多筛选'}
          </Button>
        </div>
        {showAdvancedFilters && (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <Select
              label="状态"
              value={status}
              placeholder="全部状态"
              options={[
                { value: 'DRAFT', label: '草稿' },
                { value: 'REVIEW', label: '待审核' },
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
              placeholder="输入精确标签"
              onChange={(event) => { filterChanged(); setTag(event.target.value); }}
            />
          </div>
        )}
      </section>

      {error && <p className="mb-4 rounded bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {selectedAsset ? (
        <AssetDetail
          key={`${selectedAsset.id}:${selectedAsset.version}`}
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
        <div className="panel p-8 text-center text-sm text-text-secondary">加载中…</div>
      ) : (
        <AssetList
          assets={assets}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onSelect={(id) => void openAsset(id)}
          onEmptyAction={() => router.push('/workspace')}
        />
      )}
      {total > 0 && <p className="mt-4 text-xs text-text-secondary">共 {total} 条资产</p>}
    </PageContainer>
  );
}
