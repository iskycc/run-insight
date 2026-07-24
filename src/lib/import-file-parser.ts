import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedImportFile = {
  headers: string[];
  rows: Record<string, unknown>[];
};

const IMPORT_FIELDS = [
  "caseNo",
  "name",
  "resultSummary",
  "logUrl",
  "progressCategory",
  "assignee",
  "rootCause",
  "mrOrTicket",
];

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCellValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function rowsFromMatrix(matrix: unknown[][]): ParsedImportFile {
  const nonEmptyRows = matrix.filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ""));
  if (nonEmptyRows.length === 0) return { headers: [], rows: [] };

  const headers = nonEmptyRows[0].map(normalizeHeader);
  const rows = nonEmptyRows.slice(1).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) record[header] = normalizeCellValue(row[index] ?? "");
    });
    return record;
  });

  return { headers, rows };
}

function parseCsvText(text: string): ParsedImportFile {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
  };
}

function parseJsonText(text: string): ParsedImportFile {
  const data = JSON.parse(text);
  const rows = Array.isArray(data) ? data : data.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return { headers: [], rows: [] };

  return {
    headers: Object.keys(rows[0]),
    rows,
  };
}

async function parseExcelFile(file: File): Promise<ParsedImportFile> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  return rowsFromMatrix(sheetRows);
}

export function buildAutoMapping(headers: string[]) {
  const autoMapping: Record<string, string> = {};

  IMPORT_FIELDS.forEach((field) => {
    const match = headers.find((header) => header.toLowerCase() === field.toLowerCase());
    if (match) autoMapping[field] = match;
  });

  return autoMapping;
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".csv")) {
    return parseCsvText(await file.text());
  }

  if (fileName.endsWith(".json")) {
    return parseJsonText(await file.text());
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    return parseExcelFile(file);
  }

  throw new Error("仅支持 CSV、JSON、Excel .xlsx/.xls 格式");
}
