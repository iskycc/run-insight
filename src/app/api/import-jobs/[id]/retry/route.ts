import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/validations";
import type { Prisma } from "@/generated/prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    if (!isValidCuid(id)) return jsonError("VALIDATION_ERROR", "无效的任务ID");
    const job = await prisma.importJob.findFirst({ where: { id, ownerId: auth.userId } });
    if (!job) return jsonError("NOT_FOUND", "任务不存在", 404);
    if (!["FAILED", "CANCELLED"].includes(job.status)) {
      return jsonError("CONFLICT", "只有失败或已取消任务可以重试", 409);
    }
    const access = await getProjectAccess(prisma, auth.userId, job.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "已无权向该项目导入", 403);
    const batch = await prisma.batchScope.findUnique({
      where: { id: job.batchScopeId },
      select: {
        projectId: true,
        testStageId: true,
        archived: true,
        project: { select: { archived: true } },
        stage: { select: { archived: true } },
      },
    });
    if (
      !batch ||
      batch.projectId !== job.projectId ||
      batch.testStageId !== job.testStageId
    ) {
      return jsonError("CONFLICT", "原导入目标已不存在或归属已变化", 409);
    }
    if (batch.archived || batch.project.archived || batch.stage.archived) {
      return jsonError("CONFLICT", "不能重试到已归档的项目、阶段或批跑", 409);
    }
    const requestId = randomUUID();
    if (
      typeof job.payload !== "object" ||
      job.payload === null ||
      Array.isArray(job.payload)
    ) {
      return jsonError("CONFLICT", "原导入任务数据已损坏，不能重试", 409);
    }
    const payload = {
      ...(job.payload as Record<string, Prisma.JsonValue>),
      requestId,
    } as Prisma.InputJsonValue;
    const retried = await prisma.importJob.create({
      data: {
        ownerId: job.ownerId, projectId: job.projectId, testStageId: job.testStageId,
        batchScopeId: job.batchScopeId, importType: job.importType, fileName: job.fileName,
        requestId, totalRows: job.totalRows, payload,
      },
      omit: { payload: true, claimToken: true },
    });
    return NextResponse.json({ job: retried }, { status: 201 });
  } catch (error) {
    return internalError("重试导入任务失败", { request, error });
  }
}
