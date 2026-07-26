import type { CaseResultDTO } from "@/types";

type CaseResultRow = {
  id: string;
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string | null;
  projectId: string;
  project?: { name: string } | null;
  testStageId: string;
  stage?: { name: string } | null;
  batchScopeId: string;
  assignee: string | null;
  assigneeId: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW" | null;
  dueDate: Date | null;
  assigneeUser?: { username: string } | null;
  progressCategory: string | null;
  rootCause: string | null;
  rootCauseCategoryId: string | null;
  rootCauseCategory?: { id: string; name: string } | null;
  mrOrTicket: string | null;
  notes: string | null;
  assetSaved: boolean;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toCaseDTO(c: CaseResultRow): CaseResultDTO {
  return {
    id: c.id,
    caseNo: c.caseNo,
    name: c.name,
    resultSummary: c.resultSummary,
    logUrl: c.logUrl,
    projectId: c.projectId,
    projectName: c.project?.name ?? null,
    testStageId: c.testStageId,
    testStageName: c.stage?.name ?? null,
    batchScopeId: c.batchScopeId,
    assignee: c.assignee,
    assigneeId: c.assigneeId,
    assigneeUsername: c.assigneeUser?.username ?? null,
    priority: c.priority,
    dueDate: c.dueDate?.toISOString() ?? null,
    progressCategory: c.progressCategory,
    rootCause: c.rootCause,
    rootCauseCategoryId: c.rootCauseCategoryId,
    rootCauseCategory: c.rootCauseCategory ?? null,
    mrOrTicket: c.mrOrTicket,
    notes: c.notes,
    assetSaved: c.assetSaved,
    updatedBy: c.updatedBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
