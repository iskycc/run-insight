import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isValidCuid, validateProgressCategory, validateStringMaxLength } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import { toCaseDTO } from "@/lib/serializers";
import type {
  CaseDetailResponse,
  UpdateCaseRequest,
} from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    if (!isValidCuid(id)) {
      return jsonError("VALIDATION_ERROR", "无效的用例ID");
    }

    const caseResult = await prisma.caseResult.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
        batchScope: { select: { id: true, name: true } },
      },
    });
    if (!caseResult) {
      return jsonError("NOT_FOUND", "用例不存在", 404);
    }

    const { project, stage, batchScope, ...caseFields } = caseResult;

    return NextResponse.json({
      case: {
        ...toCaseDTO(caseFields),
        project,
        stage,
        batchScope,
      },
    });
  } catch {
    return internalError("获取用例详情失败");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    if (!isValidCuid(id)) {
      return jsonError("VALIDATION_ERROR", "无效的用例ID");
    }

    const existing = await prisma.caseResult.findUnique({ where: { id } });
    if (!existing) {
      return jsonError("NOT_FOUND", "用例不存在", 404);
    }

    const body: UpdateCaseRequest = await request.json();
    const data: Record<string, unknown> = {};
    if (body.assignee !== undefined) data.assignee = body.assignee;
    if (body.progressCategory !== undefined) {
      const valid = validateProgressCategory(body.progressCategory);
      if (!valid) {
        return jsonError("VALIDATION_ERROR", "进展分类不合法");
      }
      data.progressCategory = body.progressCategory;
    }
    if (body.rootCause !== undefined) {
      const err = validateStringMaxLength(body.rootCause, 200, "根因");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.rootCause = body.rootCause;
    }
    if (body.mrOrTicket !== undefined) {
      const err = validateStringMaxLength(body.mrOrTicket, 200, "MR/单号");
      if (err) return jsonError("VALIDATION_ERROR", err);
      data.mrOrTicket = body.mrOrTicket;
    }
    if (body.assetSaved !== undefined) data.assetSaved = body.assetSaved;

    const updated = await prisma.caseResult.update({
      where: { id },
      data,
    });

    return NextResponse.json<CaseDetailResponse>({ case: toCaseDTO(updated) });
  } catch {
    return internalError("更新用例失败");
  }
}
