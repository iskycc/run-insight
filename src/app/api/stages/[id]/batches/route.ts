import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import {
  validateLogUrl,
  validateOptionalDate,
  validateRequired,
  validateStringMaxLength,
} from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import type { BatchScopeDTO, BatchScopeWithStats, BatchesResponse } from "@/types";

type CreateBatchBody = {
  name?: unknown;
  executedAt?: unknown;
  startedAt?: unknown;
  finishedAt?: unknown;
  environment?: unknown;
  buildVersion?: unknown;
  commitSha?: unknown;
  pipelineUrl?: unknown;
};

const ISO_DATE_TIME_WITH_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidZonedDateTime(value: string): boolean {
  const match = ISO_DATE_TIME_WITH_ZONE.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;

  const [, year, month, day, hour, minute, second = "0"] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const isLeapYear =
    numericYear % 4 === 0 &&
    (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const daysInMonth = [
    31, isLeapYear ? 29 : 28, 31, 30, 31, 30,
    31, 31, 30, 31, 30, 31,
  ][numericMonth - 1] ?? 0;

  return (
    numericDay >= 1 &&
    numericDay <= daysInMonth &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59
  );
}

function parseDateTime(
  value: unknown,
  fieldName: string,
  required = false
): { value: Date | null; error: string | null } {
  if (value === undefined) {
    return required
      ? { value: null, error: `${fieldName}不能为空` }
      : { value: null, error: null };
  }
  if (value === null || value === "") {
    return required
      ? { value: null, error: `${fieldName}不能为空` }
      : { value: null, error: null };
  }
  const formatError = validateOptionalDate(value, fieldName);
  if (
    formatError ||
    typeof value !== "string" ||
    !isValidZonedDateTime(value)
  ) {
    return { value: null, error: `${fieldName}格式不正确，必须包含时区` };
  }
  return { value: new Date(value), error: null };
}

function parseOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): { value: string | null; error: string | null } {
  if (value === undefined || value === null || value === "") {
    return { value: null, error: null };
  }
  if (typeof value !== "string") {
    return { value: null, error: `${fieldName}格式不正确` };
  }
  const normalized = value.trim();
  const error = validateStringMaxLength(normalized, maxLength, fieldName);
  return { value: normalized || null, error };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    const stage = await prisma.testStage.findUnique({ where: { id } });
    if (!stage) {
      return jsonError("NOT_FOUND", "阶段不存在", 404);
    }
    const access = await getProjectAccess(prisma, authResult.userId, stage.projectId);
    if (!access?.canView) return jsonError("FORBIDDEN", "无权访问该阶段", 403);

    const { searchParams } = request.nextUrl;
    const includeArchived = searchParams.get("includeArchived") === "true";

    const where: Record<string, unknown> = { testStageId: id };
    if (!includeArchived) where.archived = false;

    const batches = await prisma.batchScope.findMany({
      where,
      orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
      include: {
        _count: {
          select: { cases: true },
        },
      },
    });

    if (batches.length === 0) {
      return NextResponse.json<BatchesResponse>({ batches: [] });
    }

    const [passCounts, failCounts] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batches.map((b) => b.id) }, resultSummary: "PASS" },
        _count: { _all: true },
      }),
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: batches.map((b) => b.id) }, resultSummary: "FAIL" },
        _count: { _all: true },
      }),
    ]);

    const passMap = new Map(passCounts.map((r) => [r.batchScopeId, r._count._all]));
    const failMap = new Map(failCounts.map((r) => [r.batchScopeId, r._count._all]));

    const batchesWithStats: BatchScopeWithStats[] = batches.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      testStageId: b.testStageId,
      name: b.name,
      archived: b.archived,
      executedAt: b.executedAt.toISOString(),
      startedAt: b.startedAt?.toISOString() ?? null,
      finishedAt: b.finishedAt?.toISOString() ?? null,
      environment: b.environment,
      buildVersion: b.buildVersion,
      commitSha: b.commitSha,
      pipelineUrl: b.pipelineUrl,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      caseCount: b._count.cases,
      passCount: passMap.get(b.id) ?? 0,
      failCount: failMap.get(b.id) ?? 0,
    }));

    return NextResponse.json<BatchesResponse>({ batches: batchesWithStats });
  } catch {
    return internalError("获取批跑列表失败");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    const stage = await prisma.testStage.findUnique({ where: { id } });
    if (!stage) {
      return jsonError("NOT_FOUND", "阶段不存在", 404);
    }
    const access = await getProjectAccess(prisma, authResult.userId, stage.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权编辑该阶段", 403);

    const rawBody: unknown = await request.json();
    if (!isObjectBody(rawBody)) {
      return jsonError("VALIDATION_ERROR", "批跑数据格式不正确");
    }
    const body: CreateBatchBody = rawBody;
    const {
      name,
      executedAt,
      startedAt,
      finishedAt,
      environment,
      buildVersion,
      commitSha,
      pipelineUrl,
    } = body;

    const nameError = validateRequired(name, "批跑名称");
    if (nameError) {
      return jsonError("VALIDATION_ERROR", nameError);
    }
    if (typeof name !== "string" || name.trim() === "") {
      return jsonError("VALIDATION_ERROR", "批跑名称格式不正确");
    }

    const parsedExecutedAt = parseDateTime(
      executedAt,
      "执行时间",
      Object.hasOwn(body, "executedAt")
    );
    const parsedStartedAt = parseDateTime(startedAt, "开始时间");
    const parsedFinishedAt = parseDateTime(finishedAt, "结束时间");
    const parsedEnvironment = parseOptionalString(environment, "执行环境", 100);
    const parsedBuildVersion = parseOptionalString(buildVersion, "构建版本", 191);
    const parsedCommitSha = parseOptionalString(commitSha, "Commit SHA", 64);
    const parsedPipelineUrl = parseOptionalString(pipelineUrl, "流水线链接", 500);

    const validationErrors = [
      validateStringMaxLength(name.trim(), 191, "批跑名称"),
      parsedExecutedAt.error,
      parsedStartedAt.error,
      parsedFinishedAt.error,
      parsedEnvironment.error,
      parsedBuildVersion.error,
      parsedCommitSha.error,
      parsedPipelineUrl.error,
      parsedPipelineUrl.value
        ? validateLogUrl(parsedPipelineUrl.value)
        : null,
      parsedCommitSha.value && !/^[0-9a-f]{7,64}$/i.test(parsedCommitSha.value)
        ? "Commit SHA 格式不正确"
        : null,
    ].filter((error): error is string => Boolean(error));
    if (validationErrors.length > 0) {
      return jsonError("VALIDATION_ERROR", validationErrors[0]);
    }

    if (
      parsedStartedAt.value &&
      parsedFinishedAt.value &&
      parsedFinishedAt.value < parsedStartedAt.value
    ) {
      return jsonError("VALIDATION_ERROR", "结束时间不能早于开始时间");
    }

    const batch = await prisma.batchScope.create({
      data: {
        name: name.trim(),
        projectId: stage.projectId,
        testStageId: id,
        executedAt: parsedExecutedAt.value ?? new Date(),
        startedAt: parsedStartedAt.value,
        finishedAt: parsedFinishedAt.value,
        environment: parsedEnvironment.value,
        buildVersion: parsedBuildVersion.value,
        commitSha: parsedCommitSha.value,
        pipelineUrl: parsedPipelineUrl.value,
      },
    });

    const batchDTO: BatchScopeDTO = {
      id: batch.id,
      projectId: batch.projectId,
      testStageId: batch.testStageId,
      name: batch.name,
      archived: batch.archived,
      executedAt: batch.executedAt.toISOString(),
      startedAt: batch.startedAt?.toISOString() ?? null,
      finishedAt: batch.finishedAt?.toISOString() ?? null,
      environment: batch.environment,
      buildVersion: batch.buildVersion,
      commitSha: batch.commitSha,
      pipelineUrl: batch.pipelineUrl,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };

    await writeAuditLog({
      userId: authResult.userId,
      action: "CREATE",
      entityType: "batch",
      entityId: batch.id,
      changes: {
        name: batch.name,
        projectId: batch.projectId,
        testStageId: id,
        executedAt: batch.executedAt.toISOString(),
        startedAt: batch.startedAt?.toISOString() ?? null,
        finishedAt: batch.finishedAt?.toISOString() ?? null,
        environment: batch.environment,
        buildVersion: batch.buildVersion,
        commitSha: batch.commitSha,
        pipelineUrl: batch.pipelineUrl,
      },
    });

    return NextResponse.json({ batch: batchDTO }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "该批跑名称已存在", 409);
    }
    return internalError("创建批跑失败");
  }
}
