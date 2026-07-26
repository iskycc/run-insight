import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createClaimToken,
  generateReportSummary,
  getNextRunAfterOccurrence,
  getReportPeriodKey,
} from "@/lib/scheduled-reports";
import { emitWebhookEvent } from "@/lib/webhooks";

const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

type ProcessingResult =
  | { status: "processed"; snapshotId: string }
  | { status: "skipped" }
  | { status: "failed"; message: string };

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2_000) : "生成报表失败";
}

export async function runScheduledReportNow(
  reportId: string,
  ownerId: string,
  now = new Date(),
) {
  const report = await prisma.scheduledReport.findFirst({
    where: { id: reportId, ownerId },
    include: { project: { select: { archived: true } } },
  });
  if (!report) throw new Error("NOT_FOUND");
  if (report.project.archived) throw new Error("PROJECT_ARCHIVED");

  const summary = await generateReportSummary(report);
  const snapshot = await prisma.$transaction(async (tx) => {
    const snapshot = await tx.reportSnapshot.create({
      data: {
        scheduledReportId: report.id,
        projectId: report.projectId,
        reportName: report.name,
        reportType: report.type,
        periodKey: `manual:${now.toISOString()}:${createClaimToken()}`,
        summary: summary as Prisma.InputJsonValue,
        generatedAt: now,
      },
    });
    await tx.reportNotification.create({
      data: {
        userId: report.ownerId,
        projectId: report.projectId,
        snapshotId: snapshot.id,
        link: `/reports/snapshots/${encodeURIComponent(snapshot.id)}`,
      },
    });
    await tx.scheduledReport.update({
      where: { id: report.id },
      data: {
        lastRunAt: now,
        lastError: null,
        consecutiveFails: 0,
      },
    });
    return snapshot;
  });
  await emitWebhookEvent({
    projectId: report.projectId,
    event: "REPORT_GENERATED",
    data: {
      snapshotId: snapshot.id,
      scheduledReportId: report.id,
      reportType: report.type,
      generatedAt: snapshot.generatedAt.toISOString(),
      link: `/reports/snapshots/${snapshot.id}`,
    },
  });
  return snapshot;
}

export async function processDueScheduledReport(
  reportId: string,
  now = new Date(),
): Promise<ProcessingResult> {
  const claimToken = createClaimToken();
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  const claim = await prisma.scheduledReport.updateMany({
    where: {
      id: reportId,
      active: true,
      nextRunAt: { lte: now },
      OR: [{ claimToken: null }, { claimedAt: { lt: staleBefore } }],
    },
    data: { claimToken, claimedAt: now },
  });
  if (claim.count === 0) return { status: "skipped" };

  const report = await prisma.scheduledReport.findUnique({
    where: { id: reportId },
    include: { project: { select: { archived: true } } },
  });
  if (!report || report.claimToken !== claimToken || !report.active) {
    return { status: "skipped" };
  }

  try {
    if (report.project.archived) throw new Error("项目已归档");
    const summary = await generateReportSummary(report);
    const scheduledFor = report.nextRunAt;
    const periodKey = getReportPeriodKey(scheduledFor, report.timezone);
    const nextRunAt = getNextRunAfterOccurrence(report, scheduledFor);

    const snapshot = await prisma.$transaction(async (tx) => {
      const existing = await tx.reportSnapshot.findUnique({
        where: {
          scheduledReportId_periodKey: {
            scheduledReportId: report.id,
            periodKey,
          },
        },
      });
      const saved =
        existing
        ?? await tx.reportSnapshot.create({
          data: {
            scheduledReportId: report.id,
            projectId: report.projectId,
            reportName: report.name,
            reportType: report.type,
            periodKey,
            summary: summary as Prisma.InputJsonValue,
            generatedAt: now,
          },
        });
      await tx.reportNotification.upsert({
        where: { snapshotId: saved.id },
        create: {
          userId: report.ownerId,
          projectId: report.projectId,
          snapshotId: saved.id,
          link: `/reports/snapshots/${encodeURIComponent(saved.id)}`,
        },
        update: {},
      });
      const advanced = await tx.scheduledReport.updateMany({
        where: { id: report.id, claimToken },
        data: {
          nextRunAt,
          lastRunAt: now,
          claimToken: null,
          claimedAt: null,
          lastError: null,
          consecutiveFails: 0,
        },
      });
      if (advanced.count !== 1) {
        throw new Error("报表任务执行权已失效");
      }
      return saved;
    });
    await emitWebhookEvent({
      projectId: report.projectId,
      event: "REPORT_GENERATED",
      data: {
        snapshotId: snapshot.id,
        scheduledReportId: report.id,
        reportType: report.type,
        generatedAt: snapshot.generatedAt.toISOString(),
        link: `/reports/snapshots/${snapshot.id}`,
      },
    });
    return { status: "processed", snapshotId: snapshot.id };
  } catch (error) {
    const message = safeErrorMessage(error);
    await prisma.scheduledReport.updateMany({
      where: { id: report.id, claimToken },
      data: {
        claimToken: null,
        claimedAt: null,
        lastError: message,
        consecutiveFails: { increment: 1 },
      },
    });
    return { status: "failed", message };
  }
}

export async function processDueScheduledReports(
  now = new Date(),
  limit = 25,
) {
  const due = await prisma.scheduledReport.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    select: { id: true },
    orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  const results = [];
  for (const report of due) {
    results.push(await processDueScheduledReport(report.id, now));
  }
  return {
    examined: due.length,
    processed: results.filter((result) => result.status === "processed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    results,
  };
}
