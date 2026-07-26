import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { isValidCasePriority, validateProgressCategory } from "@/lib/validations";
import { toCaseDTO } from "@/lib/serializers";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const priority = params.get("priority");
    const overdue = params.get("overdue");
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize")) || 20));

    if (status && !validateProgressCategory(status)) {
      return jsonError("VALIDATION_ERROR", "任务状态不合法");
    }
    if (priority && !isValidCasePriority(priority)) {
      return jsonError("VALIDATION_ERROR", "任务优先级不合法");
    }
    if (overdue && overdue !== "true" && overdue !== "false") {
      return jsonError("VALIDATION_ERROR", "逾期筛选值不合法");
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });
    if (!user) return jsonError("UNAUTHORIZED", "用户不存在", 401);

    const where: Prisma.CaseResultWhereInput = { assigneeId: auth.userId };
    if (user.role !== "ADMIN") {
      where.project = {
        members: {
          some: { userId: auth.userId },
        },
      };
    }
    if (status) where.progressCategory = status;
    if (priority && isValidCasePriority(priority)) where.priority = priority;
    if (overdue === "true") where.dueDate = { lt: new Date() };
    if (overdue === "false") {
      where.OR = [{ dueDate: null }, { dueDate: { gte: new Date() } }];
    }

    const [cases, total] = await Promise.all([
      prisma.caseResult.findMany({
        where,
        include: {
          assigneeUser: { select: { username: true } },
          project: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true } },
          batchScope: { select: { id: true, name: true } },
        },
        orderBy: [{ dueDate: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.caseResult.count({ where }),
    ]);

    return NextResponse.json({
      tasks: cases.map(({ project, stage, batchScope, ...caseResult }) => ({
        ...toCaseDTO(caseResult),
        project,
        stage,
        batchScope,
      })),
      total,
      page,
      pageSize,
    });
  } catch {
    return internalError("获取我的待办失败");
  }
}
