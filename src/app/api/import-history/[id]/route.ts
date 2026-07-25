import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { ImportRecordDetail } from "@/types";
import { getProjectAccess } from "@/lib/project-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const record = await prisma.importRecord.findUnique({
      where: { id },
      include: {
        project: { select: { name: true } },
        user: { select: { username: true } },
      },
    });

    if (!record) {
      return jsonError("NOT_FOUND", "导入记录不存在", 404);
    }
    const access = await getProjectAccess(prisma, authResult.userId, record.projectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权查看该导入记录", 403);

    return NextResponse.json<ImportRecordDetail>({
      id: record.id,
      projectId: record.projectId,
      projectName: record.project.name,
      importType: record.importType,
      fileName: record.fileName,
      totalRows: record.totalRows,
      importedCount: record.importedCount,
      errorCount: record.errorCount,
      errors: record.errors as ImportRecordDetail["errors"],
      userId: record.userId,
      username: record.user.username,
      status:
        record.errorCount === 0
          ? "success"
          : record.importedCount > 0
            ? "partial"
            : "failed",
      rolledBackAt: record.rolledBackAt?.toISOString() ?? null,
      rolledBackBy: record.rolledBackBy,
      canRollback:
        access.canEdit &&
        record.errorCount === 0 &&
        record.rolledBackAt === null,
      createdAt: record.createdAt.toISOString(),
    });
  } catch {
    return internalError("获取导入记录详情失败");
  }
}
