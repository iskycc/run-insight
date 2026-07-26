import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import type { CasePriority } from "@/generated/prisma/enums";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { getProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

class RollbackConflictError extends Error {}

type BeforeSnapshot = {
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string | null;
  projectId: string;
  testStageId: string;
  batchScopeId: string;
  assignee: string | null;
  assigneeId: string | null;
  priority: CasePriority | null;
  dueDate: string | null;
  progressCategory: string | null;
  rootCause: string | null;
  rootCauseCategoryId: string | null;
  mrOrTicket: string | null;
  notes: string | null;
  assetSaved: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function isObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBeforeSnapshot(value: Prisma.JsonValue | null): BeforeSnapshot {
  if (!value || !isObject(value)) {
    throw new RollbackConflictError("导入前快照缺失，无法安全回滚");
  }
  return value as unknown as BeforeSnapshot;
}

function sameInstant(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const record = await prisma.importRecord.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        errorCount: true,
        rolledBackAt: true,
      },
    });
    if (!record) return jsonError("NOT_FOUND", "导入记录不存在", 404);

    const access = await getProjectAccess(
      prisma,
      authResult.userId,
      record.projectId
    );
    if (!access?.canEdit) {
      return jsonError("FORBIDDEN", "无权回滚该导入记录", 403);
    }
    if (record.errorCount !== 0) {
      return jsonError("ROLLBACK_NOT_ALLOWED", "只有成功的导入记录可以回滚", 409);
    }
    if (record.rolledBackAt) {
      return jsonError("ALREADY_ROLLED_BACK", "该导入记录已经回滚", 409);
    }

    const rolledBackAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // Claim the rollback while holding the row lock. If another request won
      // the race, no case data is touched.
      const claimed = await tx.importRecord.updateMany({
        where: {
          id,
          errorCount: 0,
          rolledBackAt: null,
        },
        data: {
          rolledBackAt,
          rolledBackBy: authResult.userId,
        },
      });
      if (claimed.count !== 1) {
        throw new RollbackConflictError("该导入记录已经回滚或状态已变化");
      }

      const changes = await tx.importChange.findMany({
        where: { importRecordId: id },
        orderBy: { createdAt: "desc" },
      });
      const cases = await tx.caseResult.findMany({
        where: { id: { in: changes.map((change) => change.caseResultId) } },
        select: { id: true, updatedAt: true },
      });
      const currentById = new Map(cases.map((item) => [item.id, item]));

      for (const change of changes) {
        const current = currentById.get(change.caseResultId);
        if (
          !current ||
          !sameInstant(current.updatedAt, change.appliedUpdatedAt)
        ) {
          throw new RollbackConflictError(
            "部分用例在导入后已被修改，请先处理冲突"
          );
        }
      }

      let deleted = 0;
      let restored = 0;
      for (const change of changes) {
        if (change.changeType === "CREATED") {
          const removal = await tx.caseResult.deleteMany({
            where: {
              id: change.caseResultId,
              updatedAt: change.appliedUpdatedAt,
            },
          });
          if (removal.count !== 1) {
            throw new RollbackConflictError("新增用例状态已变化，无法安全删除");
          }
          deleted += 1;
          continue;
        }

        const before = parseBeforeSnapshot(change.before);
        const restoreData: Prisma.CaseResultUncheckedUpdateManyInput = {
          caseNo: before.caseNo,
          name: before.name,
          resultSummary: before.resultSummary,
          logUrl: before.logUrl,
          projectId: before.projectId,
          testStageId: before.testStageId,
          batchScopeId: before.batchScopeId,
          assignee: before.assignee,
          assigneeId: before.assigneeId,
          priority: before.priority,
          dueDate: before.dueDate ? new Date(before.dueDate) : null,
          progressCategory: before.progressCategory,
          rootCause: before.rootCause,
          rootCauseCategoryId: before.rootCauseCategoryId,
          mrOrTicket: before.mrOrTicket,
          notes: before.notes,
          assetSaved: before.assetSaved,
          updatedBy: before.updatedBy,
          createdAt: new Date(before.createdAt),
          updatedAt: new Date(before.updatedAt),
        };
        const restoration = await tx.caseResult.updateMany({
          where: {
            id: change.caseResultId,
            updatedAt: change.appliedUpdatedAt,
          },
          data: restoreData,
        });
        if (restoration.count !== 1) {
          throw new RollbackConflictError("用例状态已变化，无法安全恢复");
        }
        restored += 1;
      }

      await writeAuditLog({
        userId: authResult.userId,
        action: "ROLLBACK",
        entityType: "import",
        entityId: id,
        changes: {
          projectId: record.projectId,
          deleted,
          restored,
        },
      }, tx);

      return { deleted, restored };
    }, { timeout: 60_000 });

    return NextResponse.json({
      rolledBack: true,
      rolledBackAt: rolledBackAt.toISOString(),
      ...result,
    });
  } catch (error) {
    if (error instanceof RollbackConflictError) {
      return jsonError("ROLLBACK_CONFLICT", error.message, 409);
    }
    if (
      error instanceof Error &&
      "code" in error &&
      ["P2002", "P2003", "P2025"].includes((error as { code: string }).code)
    ) {
      return jsonError(
        "ROLLBACK_CONFLICT",
        "关联数据在导入后已变化，无法安全回滚",
        409
      );
    }
    return internalError("回滚导入失败", {
      request,
      error,
      event: "import.rollback_failed",
      context: { userId: authResult.userId },
    });
  }
}
