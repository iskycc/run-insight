'use client';

interface FieldMappingProps {
  headers: string[];
  mapping: Record<string, string>;
  onMappingChange: (mapping: Record<string, string>) => void;
  sampleRow: Record<string, unknown>;
}

const REQUIRED_FIELDS = [
  { key: 'caseNo', label: '用例编号' },
  { key: 'name', label: '用例名称' },
  { key: 'resultSummary', label: '结果概要' },
];

const OPTIONAL_FIELDS = [
  { key: 'logUrl', label: '日志链接' },
  { key: 'progressCategory', label: '进展分类' },
  { key: 'assignee', label: '责任人' },
  { key: 'rootCause', label: '根因' },
  { key: 'mrOrTicket', label: 'MR/单号' },
];

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

export default function FieldMapping({ headers, mapping, onMappingChange, sampleRow }: FieldMappingProps) {
  const handleFieldChange = (fieldKey: string, header: string) => {
    onMappingChange({ ...mapping, [fieldKey]: header });
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-sm)]">
      <h3 className="mb-4 text-sm font-medium text-[var(--color-text-primary)]">字段映射</h3>
      <p className="mb-4 text-xs text-[var(--color-text-secondary)]">
        将文件中的列映射到系统字段。必填字段标有 * 号。
      </p>
      <div className="space-y-3">
        {ALL_FIELDS.map((field) => (
          <div key={field.key} className="flex items-center gap-4">
            <div className="w-32 shrink-0 text-sm">
              <span className="text-[var(--color-text-primary)]">
                {field.label}
                {REQUIRED_FIELDS.some((f) => f.key === field.key) && (
                  <span className="ml-0.5 text-[var(--color-danger)]">*</span>
                )}
              </span>
            </div>
            <span className="text-[var(--color-text-secondary)]">←</span>
            <select
              value={mapping[field.key] || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className="h-8 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] px-2 text-sm text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="">（不映射）</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            {mapping[field.key] && sampleRow[mapping[field.key]] !== undefined && (
              <span className="max-w-[200px] truncate text-xs text-[var(--color-text-secondary)]">
                示例：{String(sampleRow[mapping[field.key]])}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
