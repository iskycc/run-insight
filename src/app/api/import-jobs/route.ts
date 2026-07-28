import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getProjectAccess } from "@/lib/project-access";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  MAX_IMPORT_JOB_PAYLOAD_BYTES,
  MAX_IMPORT_JOB_PAYLOAD_LABEL,
  MAX_IMPORT_ROWS,
} from "@/lib/import-limits";

// ImportJob currently persists its JSON payload in MariaDB. Keep the request
// bounded after Prisma/JSON serialization. The bundled MariaDB service raises
// max_allowed_packet to the same practical range for 100,000-row jobs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set([
  "rows",
  "importType",
  "projectId",
  "testStageId",
  "batchScopeId",
  "fileName",
  "requestId",
]);
const PUBLIC_JOB_SELECT = {
  id: true,
  ownerId: true,
  projectId: true,
  testStageId: true,
  batchScopeId: true,
  importRecordId: true,
  importType: true,
  fileName: true,
  requestId: true,
  status: true,
  progress: true,
  totalRows: true,
  processedRows: true,
  errorCount: true,
  errorSummary: true,
  errorDetails: true,
  attempts: true,
  claimedAt: true,
  heartbeatAt: true,
  cancelRequested: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type JobScope = {
  ownerId: string;
  projectId: string;
  testStageId: string;
  batchScopeId: string;
  importType: string;
};

function sameJobScope(job: JobScope, expected: JobScope): boolean {
  return (
    job.ownerId === expected.ownerId &&
    job.projectId === expected.projectId &&
    job.testStageId === expected.testStageId &&
    job.batchScopeId === expected.batchScopeId &&
    job.importType === expected.importType
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (
    contentType !== "application/json" &&
    !(contentType?.startsWith("application/") && contentType.endsWith("+json"))
  ) {
    return jsonError("UNSUPPORTED_MEDIA_TYPE", "Content-Type 必须为 application/json", 415);
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength)
    && contentLength > MAX_IMPORT_JOB_PAYLOAD_BYTES
  ) {
    return jsonError(
      "PAYLOAD_TOO_LARGE",
      `导入任务数据不能超过 ${MAX_IMPORT_JOB_PAYLOAD_LABEL}`,
      413,
    );
  }

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_IMPORT_JOB_PAYLOAD_BYTES) {
      return jsonError(
        "PAYLOAD_TOO_LARGE",
        `导入任务数据不能超过 ${MAX_IMPORT_JOB_PAYLOAD_LABEL}`,
        413,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonError("VALIDATION_ERROR", "请求体必须是有效的 JSON 对象");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return jsonError("VALIDATION_ERROR", "请求体必须是 JSON 对象");
    }
    const body = parsed as Record<string, unknown>;
    const unknownField = Object.keys(body).find((field) => !ALLOWED_FIELDS.has(field));
    if (unknownField) {
      return jsonError("VALIDATION_ERROR", `不支持的字段：${unknownField}`);
    }
    const rows = body.rows;
    if (
      !Array.isArray(rows)
      || rows.length < 1
      || rows.length > MAX_IMPORT_ROWS
    ) {
      return jsonError(
        "VALIDATION_ERROR",
        `导入行数必须为 1 到 ${MAX_IMPORT_ROWS}`,
      );
    }
    if (
      rows.some(
        (row) => typeof row !== "object" || row === null || Array.isArray(row),
      )
    ) {
      return jsonError("VALIDATION_ERROR", "每一行导入数据都必须是 JSON 对象");
    }
    if (
      typeof body.projectId !== "string" ||
      typeof body.testStageId !== "string" ||
      typeof body.batchScopeId !== "string" ||
      typeof body.requestId !== "string" ||
      !UUID.test(body.requestId) ||
      (body.importType !== "pre-analysis" && body.importType !== "post-analysis")
    ) {
      return jsonError("VALIDATION_ERROR", "导入任务参数不合法");
    }
    if (
      body.fileName !== undefined &&
      (typeof body.fileName !== "string" || !body.fileName.trim())
    ) {
      return jsonError("VALIDATION_ERROR", "文件名必须是非空字符串");
    }
    const access = await getProjectAccess(prisma, auth.userId, body.projectId);
    if (!access?.canEdit) return jsonError("FORBIDDEN", "无权导入到该项目", 403);
    const batch = await prisma.batchScope.findUnique({
      where: { id: body.batchScopeId },
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
      batch.projectId !== body.projectId ||
      batch.testStageId !== body.testStageId
    ) return jsonError("VALIDATION_ERROR", "项目、阶段和批跑不匹配");
    if (batch.archived || batch.project.archived || batch.stage.archived) {
      return jsonError("CONFLICT", "不能向已归档的项目、阶段或批跑创建导入任务", 409);
    }

    const expectedScope: JobScope = {
      ownerId: auth.userId,
      projectId: body.projectId,
      testStageId: body.testStageId,
      batchScopeId: body.batchScopeId,
      importType: body.importType,
    };
    const existing = await prisma.importJob.findUnique({
      where: { requestId: body.requestId },
      select: PUBLIC_JOB_SELECT,
    });
    if (existing) {
      if (!sameJobScope(existing, expectedScope)) {
        return jsonError("IDEMPOTENCY_CONFLICT", "requestId 已被其他任务使用", 409);
      }
      return NextResponse.json({ job: existing });
    }
    const payload = {
      rows,
      importType: body.importType,
      projectId: body.projectId,
      testStageId: body.testStageId,
      batchScopeId: body.batchScopeId,
      fileName: typeof body.fileName === "string" ? body.fileName.trim().slice(0, 191) : "unknown",
      requestId: body.requestId,
    } satisfies Record<string, unknown>;
    try {
      const job = await prisma.importJob.create({
        data: {
          ...expectedScope,
          fileName: payload.fileName,
          requestId: body.requestId,
          totalRows: rows.length,
          payload: payload as Prisma.InputJsonValue,
        },
        select: PUBLIC_JOB_SELECT,
      });
      return NextResponse.json({ job }, { status: 201 });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const raced = await prisma.importJob.findUnique({
          where: { requestId: body.requestId },
          select: PUBLIC_JOB_SELECT,
        });
        if (raced && sameJobScope(raced, expectedScope)) {
          return NextResponse.json({ job: raced });
        }
        return jsonError("IDEMPOTENCY_CONFLICT", "requestId 已被其他任务使用", 409);
      }
      throw error;
    }
  } catch (error) {
    return internalError("创建导入任务失败", { request, error });
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const jobs = await prisma.importJob.findMany({
      where: { ownerId: auth.userId },
      select: PUBLIC_JOB_SELECT,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    return internalError("获取导入任务失败", { request, error });
  }
}
