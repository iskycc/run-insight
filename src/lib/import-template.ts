import type { ImportType } from '@/lib/validations';

export type ImportFileFormat = 'json' | 'excel';

const PRE_ANALYSIS_SAMPLE = {
  caseNo: 'TC-001',
  name: '用户登录',
  resultSummary: 'FAIL',
  logUrl: 'https://example.com/logs/TC-001',
};

const POST_ANALYSIS_SAMPLE = {
  ...PRE_ANALYSIS_SAMPLE,
  assignee: '张三',
  progressCategory: 'PENDING',
  rootCause: '示例根因',
  mrOrTicket: 'MR-123',
};

export function getImportTemplateRows(importType: ImportType): Record<string, string>[] {
  return [
    importType === 'post-analysis'
      ? { ...POST_ANALYSIS_SAMPLE }
      : { ...PRE_ANALYSIS_SAMPLE },
  ];
}

export function getImportTemplateFilename(
  importType: ImportType,
  format: ImportFileFormat,
): string {
  const typeName = importType === 'post-analysis' ? 'post-analysis' : 'pre-analysis';
  return `run-insight-${typeName}-template.${format === 'json' ? 'json' : 'xlsx'}`;
}

export function isFileCompatibleWithFormat(fileName: string, format: ImportFileFormat): boolean {
  const extension = fileName.toLowerCase().split('.').pop();
  return format === 'json'
    ? extension === 'json'
    : extension === 'xlsx' || extension === 'xls';
}
