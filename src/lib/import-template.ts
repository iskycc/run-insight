import type { ImportType } from '@/lib/validations';

export type ImportFileFormat = 'json' | 'excel';

const PRE_ANALYSIS_SAMPLES = [
  {
    caseNo: 'TC-001',
    name: '用户登录成功',
    resultSummary: 'PASS',
    logUrl: 'https://example.com/logs/TC-001',
  },
  {
    caseNo: 'TC-002',
    name: '密码错误提示',
    resultSummary: 'FAIL',
    logUrl: 'https://example.com/logs/TC-002',
  },
  {
    caseNo: 'TC-003',
    name: '依赖服务不可用',
    resultSummary: 'BLOCK',
    logUrl: 'https://example.com/logs/TC-003',
  },
  {
    caseNo: 'TC-004',
    name: '可选兼容性检查',
    resultSummary: 'SKIP',
    logUrl: '',
  },
];

const POST_ANALYSIS_SAMPLE = {
  ...PRE_ANALYSIS_SAMPLES[1],
  assignee: '张三',
  progressCategory: 'PENDING',
  rootCause: '示例根因',
  mrOrTicket: 'MR-123',
};

export function getImportTemplateRows(importType: ImportType): Record<string, string>[] {
  return importType === 'post-analysis'
    ? [{ ...POST_ANALYSIS_SAMPLE }]
    : PRE_ANALYSIS_SAMPLES.map((row) => ({ ...row }));
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
