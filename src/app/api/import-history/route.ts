import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import type {
  ImportHistoryResponse,
  ImportRecordDTO,
  ImportRecordStatus,
} from "@/types";
import { getProjectAccess } from "@/lib/project-access";

function toImportRecordDTO(r: {
  id: string;
  projectId: string;
  importType: string;
  fileName: string;
  totalRows: number;
  importedCount: number;
  errorCount: number;
  userId: string;
  rolledBackAt: Date | null;
  createdAt: Date;
  project: { name: string };
  user: { username: string };
}): ImportRecordDTO {
  return {
    id: r.id,
    projectId: r.projectId,
    projectName: r.project.name,
    importType: r.importType,
    fileName: r.fileName,
    totalRows: r.totalRows,
    importedCount: r.importedCount,
    errorCount: r.errorCount,
    userId: r.userId,
    username: r.user.username,
    status: getImportStatus(r.importedCount, r.errorCount),
    rolledBackAt: r.rolledBackAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function getImportStatus(importedCount: number, errorCount: number): ImportRecordStatus {
  if (errorCount === 0) return "success";
  return importedCount > 0 ? "partial" : "failed";
}

export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

    const user = await prisma.user.findUnique({
      where: { id: authResult.userId },
      select: { role: true },
    });
    if (!user) return jsonError("UNAUTHORIZED", "用户不存在", 401);
    const where: Record<string, unknown> = {};
    if (projectId) {
      const access = await getProjectAccess(prisma, authResult.userId, projectId);
      if (!access?.canView) return jsonError("FORBIDDEN", "无权查看该项目的导入历史", 403);
      where.projectId = projectId;
    } else if (user.role !== "ADMIN") {
      where.project = { members: { some: { userId: authResult.userId } } };
    }
    if (status && !["success", "partial", "failed"].includes(status)) {
      return jsonError("VALIDATION_ERROR", "导入状态筛选值不合法");
    }
    if (status === "success") where.errorCount = 0;
    if (status === "partial") {
      where.errorCount = { gt: 0 };
      where.importedCount = { gt: 0 };
    }
    if (status === "failed") {
      where.errorCount = { gt: 0 };
      where.importedCount = 0;
    }

    const [records, total, projectRecords] = await Promise.all([
      prisma.importRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          project: { select: { name: true } },
          user: { select: { username: true } },
        },
      }),
      prisma.importRecord.count({ where }),
      prisma.importRecord.findMany({
        distinct: ["projectId"],
        where:
          user.role === "ADMIN"
            ? undefined
            : { project: { members: { some: { userId: authResult.userId } } } },
        select: {
          project: { select: { id: true, name: true } },
        },
        orderBy: { projectId: "asc" },
      }),
    ]);

    return NextResponse.json<ImportHistoryResponse>({
      records: records.map(toImportRecordDTO),
      projects: projectRecords.map((record) => record.project),
      total,
      page,
      pageSize,
    });
  } catch {
    return internalError("获取导入历史失败");
  }
}
