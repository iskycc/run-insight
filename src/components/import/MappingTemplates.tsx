'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/shared/Button';
import type { ImportType } from '@/lib/validations';

type MappingTemplate = {
  name: string;
  mapping: Record<string, string>;
};

interface MappingTemplatesProps {
  importType: ImportType;
  headers: string[];
  mapping: Record<string, string>;
  onApply: (mapping: Record<string, string>) => void;
}

function storageKey(importType: ImportType) {
  return `run-insight:import-mapping-templates:${importType}`;
}

function readTemplates(importType: ImportType): MappingTemplate[] {
  try {
    const value = window.localStorage.getItem(storageKey(importType));
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is MappingTemplate =>
        typeof item === 'object'
        && item !== null
        && typeof (item as { name?: unknown }).name === 'string'
        && typeof (item as { mapping?: unknown }).mapping === 'object'
        && (item as { mapping?: unknown }).mapping !== null
    );
  } catch {
    return [];
  }
}

export default function MappingTemplates({
  importType,
  headers,
  mapping,
  onApply,
}: MappingTemplatesProps) {
  const [templates, setTemplates] = useState<MappingTemplate[]>(() => readTemplates(importType));
  const [selectedName, setSelectedName] = useState('');
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.name === selectedName),
    [selectedName, templates]
  );

  const persist = (nextTemplates: MappingTemplate[]) => {
    try {
      window.localStorage.setItem(storageKey(importType), JSON.stringify(nextTemplates));
      setTemplates(nextTemplates);
      setMessage('');
      return true;
    } catch {
      setMessage('模板保存失败，请检查浏览器存储空间');
      return false;
    }
  };

  const handleSave = () => {
    const name = newName.trim();
    if (!name) return;
    const nextTemplate = { name, mapping };
    const existingIndex = templates.findIndex((template) => template.name === name);
    const nextTemplates = [...templates];
    if (existingIndex >= 0) {
      nextTemplates[existingIndex] = nextTemplate;
    } else {
      nextTemplates.push(nextTemplate);
    }
    if (persist(nextTemplates)) {
      setSelectedName(name);
      setNewName('');
      setMessage(existingIndex >= 0 ? '模板已更新' : '模板已保存');
    }
  };

  const handleApply = () => {
    if (!selectedTemplate) return;
    const availableHeaders = new Set(headers);
    const applicableMapping = Object.fromEntries(
      Object.entries(selectedTemplate.mapping).filter(([, header]) => availableHeaders.has(header))
    );
    onApply(applicableMapping);
    setMessage('模板已应用；文件中不存在的列已忽略');
  };

  const handleDelete = () => {
    if (!selectedName) return;
    const nextTemplates = templates.filter((template) => template.name !== selectedName);
    if (persist(nextTemplates)) {
      setSelectedName('');
      setMessage('模板已删除');
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-border bg-[#f8faff] p-4 sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] lg:items-end">
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">已保存模板</span>
          <select
            aria-label="已保存映射模板"
            value={selectedName}
            onChange={(event) => {
              setSelectedName(event.target.value);
              setMessage('');
            }}
            className="field-control mt-2 h-11 w-full px-3 text-sm"
          >
            <option value="">选择模板</option>
            {templates.map((template) => (
              <option key={template.name} value={template.name}>{template.name}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={handleApply} disabled={!selectedTemplate}>
            应用
          </Button>
          <Button type="button" size="sm" variant="danger" onClick={handleDelete} disabled={!selectedTemplate}>
            删除
          </Button>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">保存当前映射</span>
          <input
            aria-label="映射模板名称"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSave();
            }}
            placeholder="输入模板名称"
            className="field-control mt-2 h-11 w-full px-3 text-sm"
          />
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={handleSave} disabled={!newName.trim()}>
          保存模板
        </Button>
      </div>
      {message && <p className="mt-2 text-xs text-[var(--color-text-secondary)]">{message}</p>}
    </div>
  );
}
