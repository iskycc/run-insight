import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { ImportRecordDetail } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const record = await prisma.importRecord.findUnique({ where: { id } });

    if (!record) {
      return jsonError("NOT_FOUND", "导入记录不存在", 404);
    }

    return NextResponse.json<ImportRecordDetail>({
      id: record.id,
      projectId: record.projectId,
      importType: record.importType,
      fileName: record.fileName,
      totalRows: record.totalRows,
      importedCount: record.importedCount,
      errorCount: record.errorCount,
      errors: record.errors as ImportRecordDetail["errors"],
      userId: record.userId,
      createdAt: record.createdAt.toISOString(),
    });
  } catch {
    return internalError("获取导入记录详情失败");
  }
}