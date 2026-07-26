import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/validations";

async function getCaseAccess(caseId: string, userId: string) {
  const caseResult = await prisma.caseResult.findUnique({
    where: { id: caseId },
    select: { id: true, projectId: true },
  });
  if (!caseResult) return { error: jsonError("NOT_FOUND", "用例不存在", 404) };
  const access = await getProjectAccess(prisma, userId, caseResult.projectId);
  if (!access?.canView) {
    return { error: jsonError("FORBIDDEN", "无权访问该项目", 403) };
  }
  return { caseResult };
}

async function parseContext(
  params: Promise<{ id: string }>,
  userId: string,
) {
  const { id } = await params;
  if (!isValidCuid(id)) {
    return { error: jsonError("VALIDATION_ERROR", "无效的用例ID") };
  }
  const result = await getCaseAccess(id, userId);
  if (result.error) return { error: result.error };
  return { id };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const context = await parseContext(params, auth.userId);
    if (context.error) return context.error;
    const watcher = await prisma.caseWatcher.findUnique({
      where: {
        userId_caseResultId: {
          userId: auth.userId,
          caseResultId: context.id,
        },
      },
      select: { id: true },
    });
    return NextResponse.json({ watching: Boolean(watcher) });
  } catch {
    return internalError("获取关注状态失败");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const context = await parseContext(params, auth.userId);
    if (context.error) return context.error;
    await prisma.caseWatcher.upsert({
      where: {
        userId_caseResultId: {
          userId: auth.userId,
          caseResultId: context.id,
        },
      },
      create: { userId: auth.userId, caseResultId: context.id },
      update: {},
    });
    return NextResponse.json({ watching: true }, { status: 201 });
  } catch {
    return internalError("关注用例失败");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const context = await parseContext(params, auth.userId);
    if (context.error) return context.error;
    await prisma.caseWatcher.deleteMany({
      where: { userId: auth.userId, caseResultId: context.id },
    });
    return NextResponse.json({ watching: false });
  } catch {
    return internalError("取消关注失败");
  }
}
