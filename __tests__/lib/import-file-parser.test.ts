import * as XLSX from "xlsx";
import { buildAutoMapping, parseImportFile } from "@/lib/import-file-parser";

function createExcelFile(rows: unknown[][], bookType: XLSX.BookType, fileName: string) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");

  const output = XLSX.write(workbook, { bookType, type: "array" }) as unknown;
  if (!(output instanceof ArrayBuffer)) {
    throw new Error("XLSX.write did not return an ArrayBuffer");
  }

  return new File([output], fileName);
}

describe("parseImportFile", () => {
  it("parses csv files", async () => {
    const file = new File(
      ["caseNo,name,resultSummary\nTC-001,CSV 用例,FAIL\n"],
      "cases.csv",
      { type: "text/csv" }
    );

    const parsed = await parseImportFile(file);

    expect(parsed.headers).toEqual(["caseNo", "name", "resultSummary"]);
    expect(parsed.rows).toEqual([
      { caseNo: "TC-001", name: "CSV 用例", resultSummary: "FAIL" },
    ]);
  });

  it("parses json row arrays", async () => {
    const file = new File(
      [JSON.stringify([{ caseNo: "TC-002", name: "JSON 用例", resultSummary: "PASS" }])],
      "cases.json",
      { type: "application/json" }
    );

    const parsed = await parseImportFile(file);

    expect(parsed.headers).toEqual(["caseNo", "name", "resultSummary"]);
    expect(parsed.rows[0].caseNo).toBe("TC-002");
  });

  it("parses xlsx files", async () => {
    const file = createExcelFile([
      ["caseNo", "name", "resultSummary", "progressCategory", "assignee"],
      ["TC-003", "Excel 用例", "FAIL", "LOCATED", "张三"],
    ], "xlsx", "cases.xlsx");

    const parsed = await parseImportFile(file);

    expect(parsed.headers).toEqual(["caseNo", "name", "resultSummary", "progressCategory", "assignee"]);
    expect(parsed.rows).toEqual([
      {
        caseNo: "TC-003",
        name: "Excel 用例",
        resultSummary: "FAIL",
        progressCategory: "LOCATED",
        assignee: "张三",
      },
    ]);
  });

  it("parses legacy xls files", async () => {
    const file = createExcelFile([
      ["caseNo", "name", "resultSummary", "progressCategory", "assignee"],
      ["TC-004", "老 Excel 用例", "PASS", "FIXED", "李四"],
    ], "biff8", "cases.xls");

    const parsed = await parseImportFile(file);

    expect(parsed.headers).toEqual(["caseNo", "name", "resultSummary", "progressCategory", "assignee"]);
    expect(parsed.rows).toEqual([
      {
        caseNo: "TC-004",
        name: "老 Excel 用例",
        resultSummary: "PASS",
        progressCategory: "FIXED",
        assignee: "李四",
      },
    ]);
  });

  it("rejects unsupported file types", async () => {
    const file = new File(["unsupported"], "cases.ods");

    await expect(parseImportFile(file)).rejects.toThrow("仅支持 CSV、JSON、Excel .xlsx/.xls 格式");
  });
});

describe("buildAutoMapping", () => {
  it("maps fields case-insensitively", () => {
    expect(buildAutoMapping(["CaseNo", "NAME", "resultSummary"])).toEqual({
      caseNo: "CaseNo",
      name: "NAME",
      resultSummary: "resultSummary",
    });
  });
});
