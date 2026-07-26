import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
  parseOptionalBooleanSearchParam,
  parseRequestUrl,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getProjectAccess } from "@/lib/project-access";
import {
  validateLogUrl,
  validateOptionalDate,
  validateStringMaxLength,
} from "@/lib/validations";

type UpdateBatchBody = {
  name?: unknown;
  archived?: unknown;
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
  required: boolean
): { value: Date | null; error: string | null } {
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

function optionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): { value: string | null; error: string | null } {
  if (value === null || value === "") return { value: null, error: null };
  if (typeof value !== "string") {
    return { value: null, error: `${fieldName}格式不正确` };
  }
  const normalized = value.trim();
  const error = validateStringMaxLength(normalized, maxLength, fieldName);
  return { value: normalized || null, error };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const parsedBody = await parseJsonObject(request, [
      "name",
      "archived",
      "executedAt",
      "startedAt",
      "finishedAt",
      "environment",
      "buildVersion",
      "commitSha",
      "pipelineUrl",
    ]);
    if (!parsedBody.ok) return parsedBody.response;
    const body: UpdateBatchBody = parsedBody.value;

    const existing = await prisma.batchScope.findUnique({
      where: { id },
      include: {
        project: { select: { archived: true } },
        stage: { select: { archived: true } },
      },
    });
    if (!existing) return jsonError("NOT_FOUND", "批跑不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, existing.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权编辑该批跑", 403);
    if (existing.project?.archived || existing.stage?.archived) {
      return jsonError("CONFLICT", "请先恢复批跑所属的项目和阶段", 409);
    }
    if (
      existing.archived &&
      !(
        Object.keys(body).length === 1 &&
        body.archived === false
      )
    ) {
      return jsonError("CONFLICT", "已归档批跑只能执行恢复操作", 409);
    }

    const data: Record<string, unknown> = {};
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") {
        return jsonError("VALIDATION_ERROR", "归档状态格式不正确");
      }
      data.archived = body.archived;
    }
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return jsonError("VALIDATION_ERROR", "批跑名称不能为空");
      }
      const name = body.name.trim();
      const error = validateStringMaxLength(name, 191, "批跑名称");
      if (error) return jsonError("VALIDATION_ERROR", error);
      data.name = name;
    }

    for (const [key, fieldName] of [
      ["executedAt", "执行时间"],
      ["startedAt", "开始时间"],
      ["finishedAt", "结束时间"],
    ] as const) {
      const value = body[key];
      if (value === undefined) continue;
      const parsed = parseDateTime(value, fieldName, key === "executedAt");
      if (parsed.error) return jsonError("VALIDATION_ERROR", parsed.error);
      data[key] = parsed.value;
    }

    for (const [key, fieldName, maxLength] of [
      ["environment", "执行环境", 100],
      ["buildVersion", "构建版本", 191],
      ["commitSha", "Commit SHA", 64],
    ] as const) {
      if (body[key] === undefined) continue;
      const normalized = optionalString(body[key], fieldName, maxLength);
      if (normalized.error) return jsonError("VALIDATION_ERROR", normalized.error);
      if (
        key === "commitSha" &&
        normalized.value &&
        !/^[0-9a-f]{7,64}$/i.test(normalized.value)
      ) {
        return jsonError("VALIDATION_ERROR", "Commit SHA 格式不正确");
      }
      data[key] = normalized.value;
    }

    if (body.pipelineUrl !== undefined) {
      const normalized = optionalString(body.pipelineUrl, "流水线链接", 500);
      if (normalized.error) return jsonError("VALIDATION_ERROR", normalized.error);
      const urlError = normalized.value ? validateLogUrl(normalized.value) : null;
      if (urlError) return jsonError("VALIDATION_ERROR", urlError);
      data.pipelineUrl = normalized.value;
    }

    if (Object.keys(data).length === 0) {
      return jsonError("VALIDATION_ERROR", "没有可更新的字段");
    }

    const startedAt = data.startedAt === undefined
      ? existing.startedAt
      : data.startedAt as Date | null;
    const finishedAt = data.finishedAt === undefined
      ? existing.finishedAt
      : data.finishedAt as Date | null;
    if (startedAt && finishedAt && finishedAt < startedAt) {
      return jsonError("VALIDATION_ERROR", "结束时间不能早于开始时间");
    }

    const updated = await prisma.batchScope.update({ where: { id }, data });

    await writeAuditLog({
      userId: authResult.userId,
      action: body.archived === true
        ? "ARCHIVE"
        : body.archived === false
          ? "UNARCHIVE"
          : "UPDATE",
      entityType: "batch",
      entityId: id,
      changes: data,
    });

    return NextResponse.json({
      id: updated.id,
      projectId: updated.projectId,
      testStageId: updated.testStageId,
      name: updated.name,
      archived: updated.archived,
      executedAt: updated.executedAt.toISOString(),
      startedAt: updated.startedAt?.toISOString() ?? null,
      finishedAt: updated.finishedAt?.toISOString() ?? null,
      environment: updated.environment,
      buildVersion: updated.buildVersion,
      commitSha: updated.commitSha,
      pipelineUrl: updated.pipelineUrl,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
      return jsonError("CONFLICT", "该批跑名称已存在", 409);
    }
    return internalError("更新批跑失败", {
      request,
      error,
      event: "batch.update_failed",
      context: { userId: authResult.userId },
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;
  let permanent = false;

  try {
    const parsedUrl = parseRequestUrl(request);
    if (!parsedUrl.ok) return parsedUrl.response;
    const permanentParam = parseOptionalBooleanSearchParam(
      parsedUrl.value.searchParams,
      "permanent",
    );
    if (!permanentParam.ok) return permanentParam.response;
    permanent = permanentParam.value;
    const { id } = await params;
    const existing = await prisma.batchScope.findUnique({ where: { id } });
    if (!existing) return jsonError("NOT_FOUND", "批跑不存在", 404);
    const access = await getProjectAccess(prisma, authResult.userId, existing.projectId);
    if (permanent ? !access?.canAdmin : !access?.canEdit) {
      return jsonError(
        "FORBIDDEN",
        permanent ? "无权永久删除该批跑" : "无权将该批跑移至回收站",
        403
      );
    }

    if (permanent) {
      if (!existing.archived) {
        return jsonError(
          "CONFLICT",
          "请先将批跑移至回收站，再执行永久删除",
          409
        );
      }

      await prisma.batchScope.delete({ where: { id } });

      await writeAuditLog({
        userId: authResult.userId,
        action: "DELETE",
        entityType: "batch",
        entityId: id,
        changes: {
          permanent: true,
          name: existing.name,
          projectId: existing.projectId,
          testStageId: existing.testStageId,
        },
      });

      return NextResponse.json({ deleted: true, permanent: true });
    }

    if (!existing.archived) {
      await prisma.batchScope.update({
        where: { id },
        data: { archived: true },
      });

      await writeAuditLog({
        userId: authResult.userId,
        action: "ARCHIVE",
        entityType: "batch",
        entityId: id,
        changes: { archived: true, movedToTrash: true },
      });
    }

    return NextResponse.json({
      deleted: true,
      archived: true,
      permanent: false,
    });
  } catch (error) {
    return internalError(
      permanent ? "永久删除批跑失败" : "将批跑移至回收站失败",
      {
        request,
        error,
        event: permanent
          ? "batch.permanent_delete_failed"
          : "batch.trash_failed",
        context: { userId: authResult.userId },
      },
    );
  }
}
