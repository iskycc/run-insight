import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { emitWebhookEvent } from "@/lib/webhooks";
import type {
  QualityGateCheck,
  QualityGateMetric,
  QualityGateResponse,
} from "@/types";

const DEFAULT_THRESHOLDS: Record<QualityGateMetric, number> = {
  minPassRate: 95,
  maxFailCount: 0,
  maxBlockCount: 0,
  maxPendingCount: 0,
};

function parseThreshold(
  searchParams: URLSearchParams,
  key: QualityGateMetric,
): { value: number; error: string | null } {
  const raw = searchParams.get(key);
  if (raw === null) return { value: DEFAULT_THRESHOLDS[key], error: null };
  if (raw.trim() === "") {
    return { value: 0, error: `${key} 不能为空` };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { value: 0, error: `${key} 必须是数字` };
  }
  if (key === "minPassRate") {
    if (value < 0 || value > 100) {
      return { value: 0, error: "minPassRate 必须在 0 到 100 之间" };
    }
    return { value, error: null };
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    return {
      value: 0,
      error: `${key} 必须是 0 到 1000000 之间的整数`,
    };
  }
  return { value, error: null };
}

function percentage(part: number, total: number) {
  if (total === 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function countByResult(
  groups: Array<{ resultSummary: string; _count: { _all: number } }>,
  resultSummary: string,
) {
  return groups.find((group) => group.resultSummary === resultSummary)?._count._all ?? 0;
}

function createCheck(
  metric: QualityGateMetric,
  label: string,
  actual: number,
  threshold: number,
  mode: "min" | "max",
): QualityGateCheck {
  const passed = mode === "min" ? actual >= threshold : actual <= threshold;
  const comparator = mode === "min" ? "不低于" : "不高于";
  const unit = metric === "minPassRate" ? "%" : " 个";
  return {
    metric,
    label,
    actual,
    threshold,
    passed,
    reason: `${label} ${actual}${unit}，要求${comparator} ${threshold}${unit}`,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId")?.trim();
    const batchId = searchParams.get("batchId")?.trim() || null;
    if (!projectId) {
      return jsonError("VALIDATION_ERROR", "projectId 为必填参数");
    }

    const thresholds = {} as Record<QualityGateMetric, number>;
    for (const key of Object.keys(DEFAULT_THRESHOLDS) as QualityGateMetric[]) {
      const parsed = parseThreshold(searchParams, key);
      if (parsed.error) {
        return jsonError("VALIDATION_ERROR", parsed.error);
      }
      thresholds[key] = parsed.value;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, archived: true },
    });
    if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
    const access = await getProjectAccess(prisma, auth.userId, projectId);
    if (!access?.canView) {
      return jsonError("FORBIDDEN", "无权查看该项目的质量门禁", 403);
    }
    if (project.archived) {
      return jsonError("CONFLICT", "已归档项目不能执行质量门禁", 409);
    }

    const selectedBatch = batchId
      ? await prisma.batchScope.findFirst({
          where: { id: batchId, projectId },
          include: { stage: { select: { archived: true } } },
        })
      : await prisma.batchScope.findFirst({
          where: {
            projectId,
            archived: false,
            stage: { archived: false },
          },
          include: { stage: { select: { archived: true } } },
          orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
        });

    if (!selectedBatch) {
      return jsonError(
        "NOT_FOUND",
        batchId ? "批跑不存在或不属于指定项目" : "该项目暂无活跃批跑",
        404,
      );
    }
    if (selectedBatch.projectId !== projectId) {
      return jsonError("VALIDATION_ERROR", "批跑不属于指定项目");
    }
    if (selectedBatch.archived || selectedBatch.stage.archived) {
      return jsonError("CONFLICT", "已归档阶段或批跑不能执行质量门禁", 409);
    }

    const baseline = await prisma.batchScope.findFirst({
      where: {
        projectId,
        testStageId: selectedBatch.testStageId,
        archived: false,
        OR: [
          { executedAt: { lt: selectedBatch.executedAt } },
          {
            executedAt: selectedBatch.executedAt,
            createdAt: { lt: selectedBatch.createdAt },
          },
        ],
      },
      orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
    });

    const [currentGroups, pendingCount, baselineGroups] = await Promise.all([
      prisma.caseResult.groupBy({
        by: ["resultSummary"],
        where: { batchScopeId: selectedBatch.id },
        _count: { _all: true },
      }),
      prisma.caseResult.count({
        where: {
          batchScopeId: selectedBatch.id,
          progressCategory: "PENDING",
        },
      }),
      baseline
        ? prisma.caseResult.groupBy({
            by: ["resultSummary"],
            where: { batchScopeId: baseline.id },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const totalCount = currentGroups.reduce(
      (sum, group) => sum + group._count._all,
      0,
    );
    const passCount = countByResult(currentGroups, "PASS");
    const failCount = countByResult(currentGroups, "FAIL");
    const blockCount = countByResult(currentGroups, "BLOCK");
    const passRate = percentage(passCount, totalCount);

    const checks = [
      createCheck(
        "minPassRate",
        "通过率",
        passRate,
        thresholds.minPassRate,
        "min",
      ),
      createCheck(
        "maxFailCount",
        "失败用例",
        failCount,
        thresholds.maxFailCount,
        "max",
      ),
      createCheck(
        "maxBlockCount",
        "阻塞用例",
        blockCount,
        thresholds.maxBlockCount,
        "max",
      ),
      createCheck(
        "maxPendingCount",
        "待分析用例",
        pendingCount,
        thresholds.maxPendingCount,
        "max",
      ),
    ];
    const reasons = checks.filter((check) => !check.passed).map((check) => check.reason);

    let comparison: QualityGateResponse["comparison"] = null;
    if (baseline) {
      const baselineTotal = baselineGroups.reduce(
        (sum, group) => sum + group._count._all,
        0,
      );
      const baselinePassRate = percentage(
        countByResult(baselineGroups, "PASS"),
        baselineTotal,
      );
      const delta = Number((passRate - baselinePassRate).toFixed(1));
      comparison = {
        baselineBatchId: baseline.id,
        baselineBatchName: baseline.name,
        baselinePassRate,
        delta,
        regression: delta < 0,
      };
    }

    const responseBody: QualityGateResponse = {
      passed: reasons.length === 0,
      reasons,
      thresholds,
      batch: {
        id: selectedBatch.id,
        name: selectedBatch.name,
        projectId: selectedBatch.projectId,
        testStageId: selectedBatch.testStageId,
        executedAt: selectedBatch.executedAt.toISOString(),
      },
      metrics: {
        totalCount,
        passCount,
        failCount,
        blockCount,
        pendingCount,
        passRate,
      },
      checks,
      comparison,
    };
    if (!responseBody.passed) {
      await emitWebhookEvent({
        projectId: selectedBatch.projectId,
        event: "QUALITY_GATE_FAILED",
        data: {
          batchId: selectedBatch.id,
          testStageId: selectedBatch.testStageId,
          reasons,
          metrics: responseBody.metrics,
        },
      });
    }
    return NextResponse.json<QualityGateResponse>(responseBody);
  } catch {
    return internalError("计算质量门禁失败");
  }
}
