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
    <div className="space-y-3">
      <div className="grid grid-cols-[132px_minmax(0,1fr)_minmax(120px,180px)] gap-4 px-3 text-xs font-semibold text-[var(--color-text-secondary)] max-md:hidden">
        <span>系统字段</span>
        <span>文件列</span>
        <span>样例</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        {ALL_FIELDS.map((field) => (
          <div
            key={field.key}
            className="grid gap-3 border-b border-border/70 px-4 py-4 transition-colors last:border-b-0 hover:bg-[#f8faff] md:grid-cols-[132px_minmax(0,1fr)_minmax(120px,180px)] md:items-center"
          >
            <div className="min-w-0 text-sm">
              <span className="font-medium text-[var(--color-text-primary)]">
                {field.label}
                {REQUIRED_FIELDS.some((f) => f.key === field.key) && (
                  <span className="ml-0.5 text-[var(--color-danger)]">*</span>
                )}
              </span>
            </div>
            <select
              aria-label={`${field.label}对应的文件列`}
              value={mapping[field.key] || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className="field-control h-11 min-w-0 px-3 text-sm"
            >
              <option value="">（不映射）</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className="min-w-0 truncate rounded-lg bg-bg/70 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              {mapping[field.key] && sampleRow[mapping[field.key]] !== undefined
                ? String(sampleRow[mapping[field.key]])
                : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
