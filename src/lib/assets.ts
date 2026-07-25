import type { AssetDTO, AssetStatus } from "@/types";

export type AssetRow = {
  id: string;
  sourceCaseId: string | null;
  projectId: string;
  rootCauseCategoryId: string | null;
  title: string;
  summary: string;
  solution: string;
  rootCauseText: string | null;
  tags: unknown;
  status: AssetStatus;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  viewCount: number;
  reuseCount: number;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; name: string };
  rootCauseCategory: { id: string; name: string } | null;
  sourceCase: {
    id: string;
    caseNo: string;
    name: string;
    resultSummary: string;
  } | null;
  creator?: { username: string } | null;
  updater?: { username: string } | null;
};

export const assetInclude = {
  project: { select: { id: true, name: true } },
  rootCauseCategory: { select: { id: true, name: true } },
  sourceCase: {
    select: { id: true, caseNo: true, name: true, resultSummary: true },
  },
  creator: { select: { username: true } },
  updater: { select: { username: true } },
} as const;

export function readAssetTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === "string");
}

export function toAssetDTO(asset: AssetRow, canEdit: boolean): AssetDTO {
  return {
    ...asset,
    tags: readAssetTags(asset.tags),
    canEdit,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function buildAssetSnapshot(caseResult: {
  caseNo: string;
  name: string;
  resultSummary: string;
  rootCause: string | null;
  notes: string | null;
  mrOrTicket: string | null;
}) {
  const rootCause = caseResult.rootCause?.trim();
  return {
    title: caseResult.name,
    summary: [
      `来源用例：${caseResult.caseNo}`,
      `执行结果：${caseResult.resultSummary}`,
      rootCause ? `问题根因：${rootCause}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    solution:
      caseResult.notes?.trim() ||
      caseResult.mrOrTicket?.trim() ||
      "待补充解决方案",
    rootCauseText: rootCause || null,
  };
}
