import {
  validateRequired,
  validateStringMaxLength,
  validateProgressCategory,
  isValidCuid,
  validateCaseNo,
  validateLogUrl,
  validateImportData,
  validateResultSummary,
  validateImportDataClient,
} from "@/lib/validations";

describe("validateRequired", () => {
  it("should return error for null", () => {
    expect(validateRequired(null, "字段")).toBe("字段不能为空");
  });

  it("should return error for undefined", () => {
    expect(validateRequired(undefined, "字段")).toBe("字段不能为空");
  });

  it("should return error for empty string", () => {
    expect(validateRequired("", "字段")).toBe("字段不能为空");
  });

  it("should return null for valid value", () => {
    expect(validateRequired("hello", "字段")).toBeNull();
  });

  it("should return null for numeric-like non-empty value", () => {
    expect(validateRequired(0, "字段")).toBeNull();
  });
});

describe("validateStringMaxLength", () => {
  it("should return null when under the limit", () => {
    expect(validateStringMaxLength("abc", 10, "字段")).toBeNull();
  });

  it("should return null when at the limit", () => {
    expect(validateStringMaxLength("a".repeat(10), 10, "字段")).toBeNull();
  });

  it("should return error when over the limit", () => {
    expect(validateStringMaxLength("a".repeat(11), 10, "字段")).toBe(
      "字段长度不能超过10个字符"
    );
  });
});

describe("validateProgressCategory", () => {
  it("should return the category for a valid category", () => {
    expect(validateProgressCategory("PENDING")).toBe("PENDING");
    expect(validateProgressCategory("FIXED")).toBe("FIXED");
    expect(validateProgressCategory("NOT_ISSUE")).toBe("NOT_ISSUE");
  });

  it("should return null for an invalid category", () => {
    expect(validateProgressCategory("INVALID")).toBeNull();
  });

  it("should return null for undefined", () => {
    expect(validateProgressCategory(undefined)).toBeNull();
  });
});

describe("isValidCuid", () => {
  it("should return true for a valid cuid", () => {
    expect(isValidCuid("clxxxxxxxxxxxxxxxxxxxxxx1")).toBe(true);
  });

  it("should return false for an invalid cuid", () => {
    expect(isValidCuid("invalid-id")).toBe(false);
  });

  it("should return false for too short string", () => {
    expect(isValidCuid("clabc")).toBe(false);
  });

  it("should return false for wrong prefix", () => {
    expect(isValidCuid("xlxxxxxxxxxxxxxxxxxxxxxx1")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isValidCuid("")).toBe(false);
  });
});

describe("validateCaseNo", () => {
  it("should return error for empty string", () => {
    expect(validateCaseNo("")).toBe("用例编号不能为空");
  });

  it("should return error for whitespace-only string", () => {
    expect(validateCaseNo("   ")).toBe("用例编号不能为空");
  });

  it("should return null for valid case number", () => {
    expect(validateCaseNo("TC-001")).toBeNull();
  });

  it("should return error for too long case number (>100)", () => {
    expect(validateCaseNo("a".repeat(101))).toBe(
      "用例编号长度不能超过100个字符"
    );
  });

  it("should return error for non-string value", () => {
    expect(validateCaseNo(123 as unknown as string)).toBe("用例编号不能为空");
  });
});

describe("validateLogUrl", () => {
  it("should return null for undefined", () => {
    expect(validateLogUrl(undefined)).toBeNull();
  });

  it("should return null for empty string (optional field)", () => {
    // Empty string is falsy → treated as not provided → returns null
    expect(validateLogUrl("")).toBeNull();
  });

  it("should return null for valid http URL", () => {
    expect(validateLogUrl("http://example.com/log")).toBeNull();
  });

  it("should return null for valid https URL", () => {
    expect(validateLogUrl("https://example.com/log")).toBeNull();
  });

  it("should return error for invalid URL", () => {
    expect(validateLogUrl("not-a-url")).toBe("日志链接格式不正确");
  });

  it("should return error for non-http protocol (ftp://)", () => {
    expect(validateLogUrl("ftp://example.com/file")).toBe(
      "日志链接必须为 HTTP/HTTPS 链接"
    );
  });

  it("should return error for too long URL (>500)", () => {
    expect(validateLogUrl("https://example.com/" + "a".repeat(490))).toBe(
      "日志链接长度不能超过500个字符"
    );
  });

  it("should return error for non-string value", () => {
    expect(validateLogUrl(123 as unknown as string)).toBe("日志链接格式不正确");
  });

  it("should return error for non-string value", () => {
    expect(validateLogUrl(123 as unknown as string)).toBe("日志链接格式不正确");
  });
});

describe("validateImportData", () => {
  const validPreRow = {
    caseNo: "TC-001",
    name: "Test case 1",
    resultSummary: "FAIL",
  };

  const validPostRow = {
    caseNo: "TC-001",
    name: "Test case 1",
    resultSummary: "FAIL",
    assignee: "Alice",
    progressCategory: "FIXED",
    rootCause: "Bug in code",
  };

  it("should return no errors for pre-analysis with valid data", () => {
    const errors = validateImportData([validPreRow], "pre-analysis");
    expect(errors).toHaveLength(0);
  });

  it("should return errors for pre-analysis with missing fields", () => {
    const errors = validateImportData(
      [{ caseNo: "", name: "", resultSummary: "" }],
      "pre-analysis"
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.some((e) => e.field === "caseNo")).toBe(true);
    expect(errors.some((e) => e.field === "name")).toBe(true);
    expect(errors.some((e) => e.field === "resultSummary")).toBe(true);
  });

  it("should return no errors for post-analysis with valid data", () => {
    const errors = validateImportData([validPostRow], "post-analysis");
    expect(errors).toHaveLength(0);
  });

  it("should return errors for post-analysis missing assignee/progressCategory/rootCause", () => {
    const errors = validateImportData(
      [{ ...validPreRow, assignee: undefined, progressCategory: undefined, rootCause: undefined }],
      "post-analysis"
    );
    expect(errors.some((e) => e.field === "assignee")).toBe(true);
    expect(errors.some((e) => e.field === "progressCategory")).toBe(true);
    expect(errors.some((e) => e.field === "rootCause")).toBe(true);
  });

  it("should return error for invalid progressCategory in post-analysis", () => {
    const errors = validateImportData(
      [{ ...validPostRow, progressCategory: "INVALID_CAT" }],
      "post-analysis"
    );
    expect(errors.some((e) => e.field === "progressCategory")).toBe(true);
  });

  it("should return error for invalid logUrl format", () => {
    const errors = validateImportData(
      [{ ...validPreRow, logUrl: "not-a-url" }],
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "logUrl")).toBe(true);
  });

  it("should return error for rootCause too long in post-analysis", () => {
    const errors = validateImportData(
      [{ ...validPostRow, rootCause: "x".repeat(201) }],
      "post-analysis"
    );
    expect(errors.some((e) => e.field === "rootCause")).toBe(true);
  });

  it("should return error for mrOrTicket too long in post-analysis", () => {
    const errors = validateImportData(
      [{ ...validPostRow, mrOrTicket: "x".repeat(201) }],
      "post-analysis"
    );
    expect(errors.some((e) => e.field === "mrOrTicket")).toBe(true);
  });

  it("should return errors for empty rows", () => {
    const errors = validateImportData([], "pre-analysis");
    expect(errors).toHaveLength(0); // empty array → no rows to validate → no errors
  });

  it("should report row numbers starting from 2 (1-based + header)", () => {
    const errors = validateImportData(
      [{ caseNo: "", name: "", resultSummary: "" }],
      "pre-analysis"
    );
    expect(errors.every((e) => e.row === 2)).toBe(true);
  });

  it("should accept valid mrOrTicket in post-analysis (truthy branch)", () => {
    const errors = validateImportData(
      [{ ...validPostRow, mrOrTicket: "MR-123" }],
      "post-analysis"
    );
    expect(errors).toHaveLength(0);
  });

  it("should handle valid progressCategory in else-if truthy branch", () => {
    // progressCategory is present and valid → enters else if, validateProgressCategory returns non-null → no error
    const errors = validateImportData(
      [{ ...validPostRow, progressCategory: "LOCATED" }],
      "post-analysis"
    );
    expect(errors.filter((e) => e.field === "progressCategory")).toHaveLength(0);
  });

  it("should handle valid rootCause in else-if truthy branch", () => {
    // rootCause is present and valid length → enters else if, validateStringMaxLength returns null → no error
    const errors = validateImportData(
      [{ ...validPostRow, rootCause: "代码缺陷" }],
      "post-analysis"
    );
    expect(errors.filter((e) => e.field === "rootCause")).toHaveLength(0);
  });

  it("should handle row with null caseNo using nullish coalescing fallback", () => {
    // Covers line 79: row.caseNo ?? "" where caseNo is null → uses "" fallback
    const errors = validateImportData(
      [{ caseNo: null, name: "Test", resultSummary: "FAIL" }],
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "caseNo")).toBe(true);
  });

  it("should handle row with undefined caseNo using nullish coalescing fallback", () => {
    // Covers line 79: row.caseNo ?? "" where caseNo is undefined → uses "" fallback
    const errors = validateImportData(
      [{ caseNo: undefined, name: "Test", resultSummary: "FAIL" }],
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "caseNo")).toBe(true);
  });

  it("should handle post-analysis with falsy numeric progressCategory (0) that passes validateRequired but fails else-if", () => {
    // Covers line 113 else-if false branch: validateRequired(0) returns null (0 is not null/undefined/""),
    // but 0 is falsy so else if (row.progressCategory) is false
    const errors = validateImportData(
      [{ ...validPostRow, progressCategory: 0 }],
      "post-analysis"
    );
    // progressCategory 0 passes validateRequired but doesn't enter else-if → no extra validation error
    const progressErrors = errors.filter((e) => e.field === "progressCategory");
    expect(progressErrors).toHaveLength(0);
  });

  it("should handle post-analysis with falsy numeric rootCause (0) that passes validateRequired but fails else-if", () => {
    // Covers line 127 else-if false branch: validateRequired(0) returns null,
    // but 0 is falsy so else if (row.rootCause) is false
    const errors = validateImportData(
      [{ ...validPostRow, rootCause: 0 }],
      "post-analysis"
    );
    const rootCauseErrors = errors.filter((e) => e.field === "rootCause");
    expect(rootCauseErrors).toHaveLength(0);
  });

  it("should skip progressCategory validation when empty string in post-analysis", () => {
    const errors = validateImportData(
      [{ ...validPostRow, progressCategory: "" }],
      "post-analysis"
    );
    // Empty string fails validateRequired, so we get the required error
    expect(errors.some((e) => e.field === "progressCategory")).toBe(true);
  });
});

describe("validateResultSummary", () => {
  it("should return error for empty string", () => {
    expect(validateResultSummary("")).toBe("结果概要不能为空");
  });

  it("should return error for whitespace-only string", () => {
    expect(validateResultSummary("   ")).toBe("结果概要不能为空");
  });

  it("should return error for invalid value like UNKNOWN", () => {
    expect(validateResultSummary("UNKNOWN")).toBe("结果概要必须为 PASS/FAIL/BLOCK/SKIP 之一");
  });

  it("should return null for valid value PASS", () => {
    expect(validateResultSummary("PASS")).toBeNull();
  });

  it("should return null for valid value FAIL", () => {
    expect(validateResultSummary("FAIL")).toBeNull();
  });

  it("should return null for valid value BLOCK", () => {
    expect(validateResultSummary("BLOCK")).toBeNull();
  });

  it("should return null for valid value SKIP", () => {
    expect(validateResultSummary("SKIP")).toBeNull();
  });

  it("should be case insensitive: 'pass' should be valid", () => {
    expect(validateResultSummary("pass")).toBeNull();
  });

  it("should be case insensitive: 'fail' should be valid", () => {
    expect(validateResultSummary("fail")).toBeNull();
  });

  it("should be case insensitive: 'block' should be valid", () => {
    expect(validateResultSummary("block")).toBeNull();
  });

  it("should be case insensitive: 'skip' should be valid", () => {
    expect(validateResultSummary("skip")).toBeNull();
  });
});

describe("validateImportDataClient", () => {
  const validMapping = {
    caseNo: "用例编号",
    name: "用例名称",
    resultSummary: "结果概要",
    logUrl: "日志链接",
    assignee: "分析责任人",
    progressCategory: "进展分类",
    rootCause: "问题根因",
    mrOrTicket: "MR/单号",
  };

  const validRawRow = {
    用例编号: "TC-001",
    用例名称: "Test case 1",
    结果概要: "FAIL",
    日志链接: "https://example.com/log",
    分析责任人: "Alice",
    进展分类: "FIXED",
    问题根因: "Bug in code",
    "MR/单号": "MR-123",
  };

  it("should return error when rows exceed MAX_IMPORT_ROWS (10000)", () => {
    const rows = Array.from({ length: 10001 }, (_, i) => ({
      用例编号: `TC-${i}`,
      用例名称: "Test",
      结果概要: "PASS",
    }));
    const { errors, mappedRows } = validateImportDataClient(rows, validMapping, "pre-analysis");
    expect(errors.some((e) => e.row === 0 && e.message.includes("10000"))).toBe(true);
    expect(mappedRows).toHaveLength(10001);
  });

  it("should map rows through field mapping correctly", () => {
    const { errors: _errors, mappedRows } = validateImportDataClient(
      [validRawRow],
      validMapping,
      "post-analysis"
    );
    expect(mappedRows).toHaveLength(1);
    expect(mappedRows[0].caseNo).toBe("TC-001");
    expect(mappedRows[0].name).toBe("Test case 1");
    expect(mappedRows[0].resultSummary).toBe("FAIL");
  });

  it("should validate caseNo (required, max 100)", () => {
    const { errors } = validateImportDataClient(
      [{ 用例编号: "", 用例名称: "Test", 结果概要: "PASS" }],
      validMapping,
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "caseNo")).toBe(true);
  });

  it("should validate caseNo max length", () => {
    const { errors } = validateImportDataClient(
      [{ 用例编号: "a".repeat(101), 用例名称: "Test", 结果概要: "PASS" }],
      validMapping,
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "caseNo")).toBe(true);
  });

  it("should validate name (required)", () => {
    const { errors } = validateImportDataClient(
      [{ 用例编号: "TC-001", 用例名称: "", 结果概要: "PASS" }],
      validMapping,
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  it("should validate resultSummary (required, valid enum)", () => {
    const { errors } = validateImportDataClient(
      [{ 用例编号: "TC-001", 用例名称: "Test", 结果概要: "" }],
      validMapping,
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "resultSummary")).toBe(true);
  });

  it("should validate resultSummary invalid enum value", () => {
    const { errors } = validateImportDataClient(
      [{ 用例编号: "TC-001", 用例名称: "Test", 结果概要: "UNKNOWN" }],
      validMapping,
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "resultSummary")).toBe(true);
  });

  it("should validate logUrl (optional, URL format, max 500)", () => {
    const { errors } = validateImportDataClient(
      [{ 用例编号: "TC-001", 用例名称: "Test", 结果概要: "PASS", 日志链接: "not-a-url" }],
      validMapping,
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "logUrl")).toBe(true);
  });

  it("should validate logUrl max length", () => {
    const { errors } = validateImportDataClient(
      [{ 用例编号: "TC-001", 用例名称: "Test", 结果概要: "PASS", 日志链接: "https://example.com/" + "a".repeat(490) }],
      validMapping,
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "logUrl")).toBe(true);
  });

  it("should return no errors for valid logUrl", () => {
    const { errors } = validateImportDataClient(
      [{ 用例编号: "TC-001", 用例名称: "Test", 结果概要: "PASS", 日志链接: "https://example.com/log" }],
      validMapping,
      "pre-analysis"
    );
    expect(errors.some((e) => e.field === "logUrl")).toBe(false);
  });

  it("should validate post-analysis fields: assignee required", () => {
    const row = { ...validRawRow, 分析责任人: "" };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "assignee")).toBe(true);
  });

  it("should validate post-analysis fields: progressCategory required", () => {
    const row = { ...validRawRow, 进展分类: "" };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "progressCategory")).toBe(true);
  });

  it("should validate post-analysis: valid progressCategory enum passes", () => {
    const row = { ...validRawRow, 进展分类: "LOCATED" };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "progressCategory")).toBe(false);
  });

  it("should validate post-analysis: invalid progressCategory returns error", () => {
    const row = { ...validRawRow, 进展分类: "INVALID_CAT" };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "progressCategory")).toBe(true);
  });

  it("should validate post-analysis: rootCause required", () => {
    const row = { ...validRawRow, 问题根因: "" };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "rootCause")).toBe(true);
  });

  it("should validate post-analysis: rootCause max 200 chars", () => {
    const row = { ...validRawRow, 问题根因: "x".repeat(201) };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "rootCause")).toBe(true);
  });

  it("should validate post-analysis: mrOrTicket max 200 chars", () => {
    const row = { ...validRawRow, "MR/单号": "x".repeat(201) };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "mrOrTicket")).toBe(true);
  });

  it("should validate post-analysis: mrOrTicket optional (no value is ok)", () => {
    const row = { ...validRawRow };
    delete (row as Record<string, unknown>)["MR/单号"];
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "mrOrTicket")).toBe(false);
  });

  it("should validate post-analysis: valid mrOrTicket passes", () => {
    const row = { ...validRawRow, "MR/单号": "MR-456" };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    expect(errors.some((e) => e.field === "mrOrTicket")).toBe(false);
  });

  it("should NOT validate post-analysis fields for pre-analysis import type", () => {
    const row = { 用例编号: "TC-001", 用例名称: "Test", 结果概要: "PASS" };
    const { errors } = validateImportDataClient([row], validMapping, "pre-analysis");
    expect(errors.some((e) => e.field === "assignee")).toBe(false);
    expect(errors.some((e) => e.field === "progressCategory")).toBe(false);
    expect(errors.some((e) => e.field === "rootCause")).toBe(false);
    expect(errors.some((e) => e.field === "mrOrTicket")).toBe(false);
  });

  it("should return both errors and mappedRows", () => {
    const row = { 用例编号: "", 用例名称: "", 结果概要: "" };
    const { errors, mappedRows } = validateImportDataClient([row], validMapping, "pre-analysis");
    expect(errors.length).toBeGreaterThan(0);
    expect(mappedRows).toHaveLength(1);
  });

  it("should return no errors for valid post-analysis data", () => {
    const { errors } = validateImportDataClient([validRawRow], validMapping, "post-analysis");
    expect(errors).toHaveLength(0);
  });

  it("should return no errors for valid pre-analysis data", () => {
    const row = { 用例编号: "TC-001", 用例名称: "Test", 结果概要: "PASS" };
    const { errors } = validateImportDataClient([row], validMapping, "pre-analysis");
    expect(errors).toHaveLength(0);
  });

  it("should handle partial mapping (only some fields mapped)", () => {
    const partialMapping = { caseNo: "用例编号", name: "用例名称" };
    const row = { 用例编号: "TC-001", 用例名称: "Test", 结果概要: "PASS" };
    const { mappedRows } = validateImportDataClient([row], partialMapping, "pre-analysis");
    expect(mappedRows[0].caseNo).toBe("TC-001");
    expect(mappedRows[0].name).toBe("Test");
    // resultSummary not in mapping so it won't be mapped
    expect(mappedRows[0].resultSummary).toBeUndefined();
  });

  it("should skip mapping entry when header is empty/falsy", () => {
    const mapping = { caseNo: "", name: "用例名称", resultSummary: "结果概要" };
    const row = { 用例编号: "TC-001", 用例名称: "Test", 结果概要: "PASS" };
    const { mappedRows } = validateImportDataClient([row], mapping, "pre-analysis");
    // caseNo mapping header is "" (falsy) so it should not be mapped
    expect(mappedRows[0].caseNo).toBeUndefined();
    expect(mappedRows[0].name).toBe("Test");
  });

  it("should handle post-analysis with numeric falsy progressCategory (0)", () => {
    const row = { ...validRawRow, 进展分类: 0 };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    // 0 passes validateRequired (not null/undefined/"") but is falsy so else-if not entered
    expect(errors.some((e) => e.field === "progressCategory" && e.message.includes("不合法"))).toBe(false);
  });

  it("should handle post-analysis with numeric falsy rootCause (0)", () => {
    const row = { ...validRawRow, 问题根因: 0 };
    const { errors } = validateImportDataClient([row], validMapping, "post-analysis");
    const rootCauseErrors = errors.filter((e) => e.field === "rootCause");
    expect(rootCauseErrors).toHaveLength(0);
  });
});
