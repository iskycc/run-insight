import type { CaseResultDTO } from "@/types";

type CaseResultRow = {
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
    testStageId: c.testStageId,
    batchScopeId: c.batchScopeId,
    assignee: c.assignee,
    progressCategory: c.progressCategory,
    rootCause: c.rootCause,
    mrOrTicket: c.mrOrTicket,
    notes: c.notes,
    assetSaved: c.assetSaved,
    updatedBy: c.updatedBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
