import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isValidCuid } from "@/lib/validations";
import { internalError, jsonError } from "@/lib/api-helpers";
import type { CaseResultDTO, SaveAssetResponse } from "@/types";

function toCaseDTO(c: {
  id: string;
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string | null;
  projectId: string;
  testStageId: string;
  batchScopeId: string;
  assignee: string | null;
  progressCategory: string | null;
  rootCause: string | null;
  mrOrTicket: string | null;
  assetSaved: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CaseResultDTO {
  return {
    id: c.id,
    caseNo: c.caseNo,
    name: c.name,
    resultSummary: c.resultSummary,
    logUrl: c.logUrl,
    projectId: c.projectId,
    testStageId: c.testStageId,
    batchScopeId: c.batchScopeId,
    assignee: c.assignee,
    progressCategory: c.progressCategory,
    rootCause: c.rootCause,
    mrOrTicket: c.mrOrTicket,
    assetSaved: c.assetSaved,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
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

    if (!existing.progressCategory) {
      return jsonError("VALIDATION_ERROR", "该用例尚未填写进展分类，无法保存为资产");
    }

    if (existing.assetSaved) {
      return jsonError("VALIDATION_ERROR", "该用例已保存为资产");
    }

    const updated = await prisma.caseResult.update({
      where: { id },
      data: { assetSaved: true },
    });

    return NextResponse.json<SaveAssetResponse>({ case: toCaseDTO(updated) });
  } catch {
    return internalError("保存资产失败");
  }
}
