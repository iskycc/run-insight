import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";

type RouteContext = { params: Promise<{ id: string }> };

function quoteCsv(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function summaryToCsv(reportType: string, summary: unknown) {
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) {
    return `value\r\n${quoteCsv(summary)}\r\n`;
  }
  const record = summary as Record<string, unknown>;
  if (reportType === "ASSIGNEE" && Array.isArray(record.stats)) {
    const columns = [
      "assignee",
      "totalCases",
      "failCount",
      "fixCount",
      "savedAssetCount",
      "fixRate",
    ];
    return [
      columns.map(quoteCsv).join(","),
      ...record.stats.map((row) => {
        const values =
          typeof row === "object" && row !== null
            ? row as Record<string, unknown>
            : {};
        return columns.map((column) => quoteCsv(values[column])).join(",");
      }),
    ].join("\r\n") + "\r\n";
  }
  if (reportType === "TREND" && Array.isArray(record.trends)) {
    const columns = [
      "batchId",
      "batch",
      "executedAt",
      "total",
      "passed",
      "failed",
      "blocked",
      "skipped",
      "passRate",
      "failRate",
      "analyzed",
    ];
    return [
      columns.map(quoteCsv).join(","),
      ...record.trends.map((row) => {
        const values =
          typeof row === "object" && row !== null
            ? row as Record<string, unknown>
            : {};
        return columns.map((column) => quoteCsv(values[column])).join(",");
      }),
    ].join("\r\n") + "\r\n";
  }
  return [
    ["field", "value"].map(quoteCsv).join(","),
    ...Object.entries(record).map(([key, value]) =>
      [quoteCsv(key), quoteCsv(value)].join(","),
    ),
  ].join("\r\n") + "\r\n";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await context.params;
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    if (format !== "json" && format !== "csv") {
      return jsonError("VALIDATION_ERROR", "format 仅支持 json 或 csv");
    }
    const snapshot = await prisma.reportSnapshot.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!snapshot) return jsonError("NOT_FOUND", "报表快照不存在", 404);
    const access = await getProjectAccess(
      prisma,
      auth.userId,
      snapshot.projectId,
    );
    if (!access?.canView) {
      return jsonError("FORBIDDEN", "无权下载该报表快照", 403);
    }
    const safeName = snapshot.reportName.replace(/[^\p{L}\p{N}_.-]+/gu, "_");
    if (format === "csv") {
      return new NextResponse(summaryToCsv(snapshot.reportType, snapshot.summary), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${safeName}.csv"`,
        },
      });
    }
    return new NextResponse(
      JSON.stringify(
        {
          id: snapshot.id,
          reportName: snapshot.reportName,
          reportType: snapshot.reportType,
          project: snapshot.project,
          generatedAt: snapshot.generatedAt.toISOString(),
          summary: snapshot.summary,
        },
        null,
        2,
      ),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${safeName}.json"`,
        },
      },
    );
  } catch {
    return internalError("下载报表快照失败");
  }
}
