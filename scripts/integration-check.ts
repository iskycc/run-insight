import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";

const runId = crypto.randomUUID().replaceAll("-", "");
const prefix = `ci-integration-${runId}`;
const organizationId = "legacy-default-organization";
let cleanupProjectId: string | null = null;

async function main() {
  const rollbackProjectName = `${prefix}-rollback`;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.project.create({
        data: { organizationId, name: rollbackProjectName },
      });
      throw new Error("intentional rollback");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "intentional rollback") {
      throw error;
    }
  }

  const rolledBack = await prisma.project.findFirst({
    where: { organizationId, name: rollbackProjectName },
    select: { id: true },
  });
  if (rolledBack) throw new Error("MariaDB transaction rollback check failed");

  const project = await prisma.project.create({
    data: { organizationId, name: `${prefix}-cascade` },
    select: { id: true },
  });
  cleanupProjectId = project.id;

  const stage = await prisma.testStage.create({
    data: { projectId: project.id, name: "Integration Stage" },
    select: { id: true },
  });
  const batch = await prisma.batchScope.create({
    data: {
      projectId: project.id,
      testStageId: stage.id,
      name: "Integration Batch",
      executedAt: new Date("2026-07-26T00:00:00.000Z"),
      environment: "CI",
      buildVersion: runId.slice(0, 12),
    },
    select: { id: true },
  });
  const caseResult = await prisma.caseResult.create({
    data: {
      projectId: project.id,
      testStageId: stage.id,
      batchScopeId: batch.id,
      caseNo: `CI-${runId.slice(0, 16)}`,
      name: "MariaDB adapter and migration smoke check",
      resultSummary: "PASS",
    },
    select: { id: true },
  });

  const persisted = await prisma.caseResult.findUnique({
    where: { id: caseResult.id },
    include: {
      project: { select: { id: true } },
      stage: { select: { id: true } },
      batchScope: {
        select: {
          id: true,
          executedAt: true,
          environment: true,
          buildVersion: true,
        },
      },
    },
  });
  if (
    !persisted
    || persisted.project.id !== project.id
    || persisted.stage.id !== stage.id
    || persisted.batchScope.id !== batch.id
    || persisted.batchScope.environment !== "CI"
  ) {
    throw new Error("MariaDB relation or batch metadata check failed");
  }

  await prisma.project.delete({ where: { id: project.id } });
  cleanupProjectId = null;

  const [stageAfterDelete, batchAfterDelete, caseAfterDelete] = await Promise.all([
    prisma.testStage.findUnique({ where: { id: stage.id }, select: { id: true } }),
    prisma.batchScope.findUnique({ where: { id: batch.id }, select: { id: true } }),
    prisma.caseResult.findUnique({ where: { id: caseResult.id }, select: { id: true } }),
  ]);
  if (stageAfterDelete || batchAfterDelete || caseAfterDelete) {
    throw new Error("MariaDB cascade delete check failed");
  }

  console.log("MariaDB migration, transaction, relation, and cascade checks passed.");
}

main()
  .catch(async (error: unknown) => {
    if (cleanupProjectId) {
      await prisma.project.deleteMany({
        where: {
          id: cleanupProjectId,
          name: { startsWith: "ci-integration-" },
        },
      });
    }
    console.error(error instanceof Error ? error.message : "Integration check failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
