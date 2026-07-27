'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { Select } from '@/components/shared/Select';
import { fetchJson, ApiError } from '@/lib/fetch';
import type { ImportType } from '@/lib/validations';
import type {
  ImportMappingTemplateDTO,
  ImportMappingTemplateScope,
  ImportMappingTemplatesResponse,
} from '@/types';

type LegacyMappingTemplate = {
  name: string;
  mapping: Record<string, string>;
};

interface MappingTemplatesProps {
  importType: ImportType;
  projectId: string;
  headers: string[];
  mapping: Record<string, string>;
  onApply: (mapping: Record<string, string>) => void;
}

function storageKey(importType: ImportType) {
  return `run-insight:import-mapping-templates:${importType}`;
}

function migrationKey(importType: ImportType) {
  return `run-insight:import-mapping-templates:migrated:${importType}`;
}

function isStringMapping(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'string')
  );
}

function readLegacyTemplates(importType: ImportType): LegacyMappingTemplate[] {
  try {
    const value = window.localStorage.getItem(storageKey(importType));
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LegacyMappingTemplate =>
        typeof item === 'object'
        && item !== null
        && typeof (item as { name?: unknown }).name === 'string'
        && isStringMapping((item as { mapping?: unknown }).mapping),
    );
  } catch {
    return [];
  }
}

export default function MappingTemplates({
  importType,
  projectId,
  headers,
  mapping,
  onApply,
}: MappingTemplatesProps) {
  const [templates, setTemplates] = useState<ImportMappingTemplateDTO[]>([]);
  const [canShare, setCanShare] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [scope, setScope] = useState<ImportMappingTemplateScope>('PERSONAL');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [legacyTemplates, setLegacyTemplates] = useState<LegacyMappingTemplate[]>([]);
  const requestRef = useRef(0);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId),
    [selectedId, templates],
  );
  const effectiveScope =
    scope === 'PROJECT' && (!projectId || !canShare) ? 'PERSONAL' : scope;

  const loadTemplates = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ importType });
      if (projectId) params.set('projectId', projectId);
      const data = await fetchJson<ImportMappingTemplatesResponse>(
        `/api/import-mapping-templates?${params.toString()}`,
      );
      if (requestId !== requestRef.current) return;
      setTemplates(data.templates);
      setCanShare(data.canShare);
      setSelectedId((current) =>
        data.templates.some((template) => template.id === current) ? current : '',
      );

      if (!window.localStorage.getItem(migrationKey(importType))) {
        setLegacyTemplates(readLegacyTemplates(importType));
      } else {
        setLegacyTemplates([]);
      }
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setTemplates([]);
      setCanShare(false);
      setMessage(error instanceof ApiError ? error.message : '模板加载失败');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [importType, projectId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTemplates();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      requestRef.current += 1;
    };
  }, [loadTemplates]);

  const handleSave = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!Object.values(mapping).some(Boolean)) {
      setMessage('请至少映射一个字段后再保存');
      return;
    }
    setBusy(true);
    try {
      await fetchJson('/api/import-mapping-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          importType,
          mapping,
          scope: effectiveScope,
          projectId: effectiveScope === 'PROJECT' ? projectId : undefined,
        }),
      });
      setNewName('');
      setMessage('模板已保存到账号');
      await loadTemplates();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '模板保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTemplate?.canManage) return;
    setBusy(true);
    try {
      await fetchJson(`/api/import-mapping-templates/${selectedTemplate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping }),
      });
      setMessage('模板已更新为当前映射');
      await loadTemplates();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '模板更新失败');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = () => {
    if (!selectedTemplate) return;
    const availableHeaders = new Set(headers);
    const applicableMapping = Object.fromEntries(
      Object.entries(selectedTemplate.mapping).filter(([, header]) =>
        availableHeaders.has(header),
      ),
    );
    onApply(applicableMapping);
    setMessage('模板已应用；文件中不存在的列已忽略');
  };

  const handleDelete = async () => {
    if (
      !selectedTemplate?.canManage
      || !window.confirm(`确定删除模板“${selectedTemplate.name}”吗？`)
    ) {
      return;
    }
    setBusy(true);
    try {
      await fetchJson<{ deleted: boolean }>(
        `/api/import-mapping-templates/${selectedTemplate.id}`,
        { method: 'DELETE' },
      );
      setSelectedId('');
      setMessage('模板已删除');
      await loadTemplates();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '模板删除失败');
    } finally {
      setBusy(false);
    }
  };

  const migrateLegacyTemplates = async () => {
    if (legacyTemplates.length === 0) return;
    setBusy(true);
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (const template of legacyTemplates) {
      try {
        await fetchJson('/api/import-mapping-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: template.name,
            importType,
            mapping: template.mapping,
            scope: 'PERSONAL',
          }),
        });
        imported += 1;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          skipped += 1;
        } else {
          failed += 1;
        }
      }
    }
    if (failed === 0) {
      window.localStorage.setItem(migrationKey(importType), '1');
      window.localStorage.removeItem(storageKey(importType));
      setLegacyTemplates([]);
    }
    setMessage(
      failed > 0
        ? `已导入 ${imported} 个，${failed} 个失败；本机数据仍保留`
        : `已导入 ${imported} 个${skipped > 0 ? `，跳过 ${skipped} 个同名模板` : ''}`,
    );
    await loadTemplates();
    setBusy(false);
  };

  return (
    <div className="mb-5 rounded-2xl border border-border bg-[#f8faff] p-4 sm:p-5">
      {legacyTemplates.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/15 bg-accent/5 px-3 py-2.5">
          <p className="text-xs text-text-secondary">
            检测到 {legacyTemplates.length} 个本机旧模板，可一次性导入当前账号。
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void migrateLegacyTemplates()}
          >
            导入旧模板
          </Button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_160px_auto] lg:items-end">
        <Select
          label="账号模板"
          aria-label="已保存映射模板"
          value={selectedId}
          disabled={loading}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setMessage('');
          }}
          options={[
            { value: '', label: loading ? '加载中…' : '选择模板' },
            ...templates.map((template) => ({
              value: template.id,
              label: `${template.name}${template.scope === 'PROJECT' ? ' · 项目共享' : ''}`,
            })),
          ]}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleApply}
            disabled={!selectedTemplate || busy}
          >
            应用
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleUpdate()}
            disabled={!selectedTemplate?.canManage || busy}
          >
            更新
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={!selectedTemplate?.canManage || busy}
          >
            删除
          </Button>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">保存当前映射</span>
          <input
            aria-label="映射模板名称"
            value={newName}
            maxLength={100}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave();
            }}
            placeholder="输入模板名称"
            className="field-control mt-2 h-11 w-full px-3 text-sm"
          />
        </label>

        <Select
          label="模板范围"
          aria-label="模板范围"
          value={effectiveScope}
          onChange={(event) =>
            setScope(event.target.value as ImportMappingTemplateScope)
          }
          options={[
            { value: 'PERSONAL', label: '仅自己' },
            ...(canShare && projectId
              ? [{ value: 'PROJECT', label: '项目共享' }]
              : []),
          ]}
        />

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void handleSave()}
          disabled={!newName.trim() || busy}
        >
          {busy ? '处理中…' : '保存模板'}
        </Button>
      </div>
      {message && <p className="mt-2 text-xs text-text-secondary">{message}</p>}
    </div>
  );
}
