import { PROGRESS_CATEGORIES, RESULT_SUMMARIES } from "@/types";
import type { ProgressCategory, ResultSummary } from "@/types";

export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") {
    return `${fieldName}不能为空`;
  }
  return null;
}

export function validateStringMaxLength(
  value: string,
  maxLength: number,
  fieldName: string
): string | null {
  if (value.length > maxLength) {
    return `${fieldName}长度不能超过${maxLength}个字符`;
  }
  return null;
}

export function validateProgressCategory(
  value: string | undefined
): ProgressCategory | null {
  if (!value) return null;
  if (PROGRESS_CATEGORIES.includes(value as ProgressCategory)) {
    return value as ProgressCategory;
  }
  return null;
}

export function isValidCuid(id: string): boolean {
  return /^c[a-z0-9]{24}$/.test(id);
}

// ============ 导入校验 ============

export type ImportType = "pre-analysis" | "post-analysis";

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export function validateCaseNo(value: string): string | null {
  const required = validateRequired(value, "用例编号");
  if (required) return required;
  if (typeof value !== "string" || value.trim().length === 0) {
    return "用例编号不能为空";
  }
  return validateStringMaxLength(value, 100, "用例编号");
}

export function validateLogUrl(value: string | undefined): string | null {
  if (!value) return null; // logUrl is optional
  if (typeof value !== "string") return "日志链接格式不正确";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "日志链接必须为 HTTP/HTTPS 链接";
    }
  } catch {
    return "日志链接格式不正确";
  }
  return validateStringMaxLength(value, 500, "日志链接");
}

export function validateImportData(
  rows: Record<string, unknown>[],
  importType: ImportType
): ValidationError[] {
  const errors: ValidationError[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // +2 for 1-based index and header row

    // caseNo is always required
    const caseNoError = validateCaseNo(String(row.caseNo ?? ""));
    if (caseNoError) {
      errors.push({ row: rowNum, field: "caseNo", message: caseNoError });
    }

    // name is always required
    const nameError = validateRequired(row.name, "用例名称");
    if (nameError) {
      errors.push({ row: rowNum, field: "name", message: nameError });
    }

    // resultSummary is always required
    const summaryError = validateRequired(row.resultSummary, "结果概要");
    if (summaryError) {
      errors.push({ row: rowNum, field: "resultSummary", message: summaryError });
    }

    // logUrl validation (optional)
    const logUrlError = validateLogUrl(row.logUrl as string | undefined);
    if (logUrlError) {
      errors.push({ row: rowNum, field: "logUrl", message: logUrlError });
    }

    // post-analysis specific fields
    if (importType === "post-analysis") {
      // Required fields for post-analysis
      const assigneeError = validateRequired(row.assignee, "分析责任人");
      if (assigneeError) {
        errors.push({ row: rowNum, field: "assignee", message: assigneeError });
      }

      const progressRequiredError = validateRequired(row.progressCategory, "进展分类");
      if (progressRequiredError) {
        errors.push({ row: rowNum, field: "progressCategory", message: progressRequiredError });
      } else if (row.progressCategory) {
        const progressError = validateProgressCategory(String(row.progressCategory));
        if (!progressError) {
          errors.push({
            row: rowNum,
            field: "progressCategory",
            message: "进展分类不合法",
          });
        }
      }

      const rootCauseError = validateRequired(row.rootCause, "问题根因");
      if (rootCauseError) {
        errors.push({ row: rowNum, field: "rootCause", message: rootCauseError });
      } else if (row.rootCause) {
        const rcError = validateStringMaxLength(String(row.rootCause), 200, "根因");
        if (rcError) errors.push({ row: rowNum, field: "rootCause", message: rcError });
      }

      if (row.mrOrTicket) {
        const mrError = validateStringMaxLength(String(row.mrOrTicket), 200, "MR/单号");
        if (mrError) errors.push({ row: rowNum, field: "mrOrTicket", message: mrError });
      }
    }
  });

  return errors;
}

// ============ 客户端预校验 ============

const MAX_IMPORT_ROWS = 100_000;

export function validateResultSummary(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return "结果概要不能为空";
  }
  if (!RESULT_SUMMARIES.includes(value.toUpperCase() as ResultSummary)) {
    return "结果概要必须为 PASS/FAIL/BLOCK/SKIP 之一";
  }
  return null;
}

/**
 * Client-side pre-validation that runs before navigating to the validate step.
 * Applies the field mapping to raw rows, then validates the mapped data.
 * Returns an object with errors array and the mapped rows.
 */
export function validateImportDataClient(
  rawRows: Record<string, unknown>[],
  mapping: Record<string, string>,
  importType: ImportType
): { errors: ValidationError[]; mappedRows: Record<string, unknown>[] } {
  const errors: ValidationError[] = [];

  // Row count limit
  if (rawRows.length > MAX_IMPORT_ROWS) {
    errors.push({
      row: 0,
      field: "",
      message: `数据行数 (${rawRows.length}) 超过上限 ${MAX_IMPORT_ROWS}`,
    });
    // Still map rows so we can return them, but the error will block proceeding
  }

  // Map rows through field mapping
  const mappedRows = rawRows.map((row) => {
    const obj: Record<string, unknown> = {};
    Object.entries(mapping).forEach(([field, header]) => {
      if (header) obj[field] = row[header];
    });
    return obj;
  });

  // Validate each mapped row
  mappedRows.forEach((row, index) => {
    const rowNum = index + 2; // +2 for 1-based index and header row

    // caseNo: required, max 100
    const caseNoError = validateCaseNo(String(row.caseNo ?? ""));
    if (caseNoError) {
      errors.push({ row: rowNum, field: "caseNo", message: caseNoError });
    }

    // name: required
    const nameError = validateRequired(row.name, "用例名称");
    if (nameError) {
      errors.push({ row: rowNum, field: "name", message: nameError });
    }

    // resultSummary: required, must be one of PASS/FAIL/BLOCK/SKIP
    const summaryError = validateResultSummary(String(row.resultSummary ?? ""));
    if (summaryError) {
      errors.push({ row: rowNum, field: "resultSummary", message: summaryError });
    }

    // logUrl: optional, valid URL format, max 500
    const logUrlError = validateLogUrl(row.logUrl as string | undefined);
    if (logUrlError) {
      errors.push({ row: rowNum, field: "logUrl", message: logUrlError });
    }

    // post-analysis specific fields
    if (importType === "post-analysis") {
      // assignee: required
      const assigneeError = validateRequired(row.assignee, "分析责任人");
      if (assigneeError) {
        errors.push({ row: rowNum, field: "assignee", message: assigneeError });
      }

      // progressCategory: required, must be valid enum
      const progressRequiredError = validateRequired(row.progressCategory, "进展分类");
      if (progressRequiredError) {
        errors.push({ row: rowNum, field: "progressCategory", message: progressRequiredError });
      } else if (row.progressCategory) {
        const progressValid = validateProgressCategory(String(row.progressCategory));
        if (!progressValid) {
          errors.push({
            row: rowNum,
            field: "progressCategory",
            message: `进展分类不合法，必须为 ${PROGRESS_CATEGORIES.join("/")} 之一`,
          });
        }
      }

      // rootCause: required, max 200
      const rootCauseError = validateRequired(row.rootCause, "问题根因");
      if (rootCauseError) {
        errors.push({ row: rowNum, field: "rootCause", message: rootCauseError });
      } else if (row.rootCause) {
        const rcError = validateStringMaxLength(String(row.rootCause), 200, "根因");
        if (rcError) errors.push({ row: rowNum, field: "rootCause", message: rcError });
      }

      // mrOrTicket: max 200
      if (row.mrOrTicket) {
        const mrError = validateStringMaxLength(String(row.mrOrTicket), 200, "MR/单号");
        if (mrError) errors.push({ row: rowNum, field: "mrOrTicket", message: mrError });
      }
    }
  });

  return { errors, mappedRows };
}
