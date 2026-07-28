import {
  getImportTemplateFilename,
  getImportTemplateRows,
  isFileCompatibleWithFormat,
} from '@/lib/import-template';

describe('import templates', () => {
  it('builds a mixed-result pre-analysis sample for one batch', () => {
    const rows = getImportTemplateRows('pre-analysis');

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.resultSummary)).toEqual([
      'PASS',
      'FAIL',
      'BLOCK',
      'SKIP',
    ]);
    expect(new Set(rows.map((row) => row.caseNo)).size).toBe(4);
  });

  it('adds analysis fields to the post-analysis sample', () => {
    expect(getImportTemplateRows('post-analysis')[0]).toEqual(expect.objectContaining({
      assignee: '张三',
      progressCategory: 'PENDING',
      rootCause: '示例根因',
      mrOrTicket: 'MR-123',
    }));
  });

  it('uses matching filenames and accepts only the selected format', () => {
    expect(getImportTemplateFilename('pre-analysis', 'json')).toBe(
      'run-insight-pre-analysis-template.json',
    );
    expect(getImportTemplateFilename('post-analysis', 'excel')).toBe(
      'run-insight-post-analysis-template.xlsx',
    );
    expect(isFileCompatibleWithFormat('cases.JSON', 'json')).toBe(true);
    expect(isFileCompatibleWithFormat('cases.xlsx', 'excel')).toBe(true);
    expect(isFileCompatibleWithFormat('cases.xls', 'excel')).toBe(true);
    expect(isFileCompatibleWithFormat('cases.json', 'excel')).toBe(false);
    expect(isFileCompatibleWithFormat('cases.csv', 'json')).toBe(false);
  });
});
