import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError } from "@/lib/api-helpers";
import type { ImportHistoryResponse, ImportRecordDTO } from "@/types";

function toImportRecordDTO(r: {
  id: string;
  projectId: string;
  importType: string;
  fileName: string;
  totalRows: number;
  importedCount: number;
  errorCount: number;
  userId: string;
  createdAt: Date;
}): ImportRecordDTO {
  return {
    id: r.id,
    projectId: r.projectId,
    importType: r.importType,
    fileName: r.fileName,
    totalRows: r.totalRows,
    importedCount: r.importedCount,
    errorCount: r.errorCount,
    userId: r.userId,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

    const where: Record<string, unknown> = {};
    if (projectId) where.projectId = projectId;

    const [records, total] = await Promise.all([
      prisma.importRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.importRecord.count({ where }),
    ]);

    return NextResponse.json<ImportHistoryResponse>({
      records: records.map(toImportRecordDTO),
      total,
      page,
      pageSize,
    });
  } catch {
    return internalError("获取导入历史失败");
  }
}