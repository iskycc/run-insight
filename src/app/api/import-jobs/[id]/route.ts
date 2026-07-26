import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/validations";

const STALE_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    if (!isValidCuid(id)) return jsonError("VALIDATION_ERROR", "无效的任务ID");
    const job = await prisma.importJob.findFirst({
      where: { id, ownerId: auth.userId },
      omit: { payload: true, claimToken: true },
    });
    if (!job) return jsonError("NOT_FOUND", "任务不存在", 404);
    return NextResponse.json({ job });
  } catch (error) {
    return internalError("获取导入任务失败", { request, error });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    if (!isValidCuid(id)) return jsonError("VALIDATION_ERROR", "无效的任务ID");
    const job = await prisma.importJob.findFirst({
      where: { id, ownerId: auth.userId },
      select: {
        id: true,
        status: true,
        claimToken: true,
        heartbeatAt: true,
      },
    });
    if (!job) return jsonError("NOT_FOUND", "任务不存在", 404);
    if (!["PENDING", "RUNNING"].includes(job.status)) {
      return jsonError("CONFLICT", "任务已结束，不能取消", 409);
    }

    const staleAt = new Date(Date.now() - STALE_MS);
    const canCancelImmediately =
      job.status === "PENDING" ||
      (job.status === "RUNNING" &&
        (job.heartbeatAt === null || job.heartbeatAt < staleAt));
    if (canCancelImmediately) {
      const cancelled = await prisma.importJob.updateMany({
        where: {
          id,
          ownerId: auth.userId,
          status: job.status,
          claimToken: job.claimToken,
        },
        data: {
          status: "CANCELLED",
          cancelRequested: true,
          finishedAt: new Date(),
        },
      });
      if (cancelled.count) {
        return NextResponse.json({
          status: "CANCELLED",
          cancelRequested: true,
          message: "导入任务已取消",
        });
      }
    }

    const requested = await prisma.importJob.updateMany({
      where: {
        id,
        ownerId: auth.userId,
        status: "RUNNING",
        claimToken: job.claimToken,
      },
      data: { cancelRequested: true },
    });
    if (!requested.count) {
      return jsonError("CONFLICT", "任务状态已变化，请刷新后重试", 409);
    }
    return NextResponse.json(
      {
        status: "RUNNING",
        cancelRequested: true,
        message: "取消请求已记录；任务已进入数据库处理时会在完成后保留实际结果",
      },
      { status: 202 },
    );
  } catch (error) {
    return internalError("取消导入任务失败", { request, error });
  }
}
