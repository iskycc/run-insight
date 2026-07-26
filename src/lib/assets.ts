import type {
  AssetDTO,
  AssetStatus,
  AssetVersionDTO,
  AssetVersionDiffChange,
} from "@/types";

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

export function toAssetDTO(
  asset: AssetRow,
  canEdit: boolean,
  canReview = false,
): AssetDTO {
  return {
    ...asset,
    tags: readAssetTags(asset.tags),
    canEdit,
    canReview,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export const assetVersionInclude = {
  author: { select: { username: true } },
} as const;

export type AssetVersionRow = {
  id: string;
  assetId: string;
  version: number;
  title: string;
  summary: string;
  solution: string;
  rootCauseText: string | null;
  tags: unknown;
  status: AssetStatus;
  changedBy: string | null;
  author: { username: string } | null;
  createdAt: Date;
};

export function toAssetVersionDTO(version: AssetVersionRow): AssetVersionDTO {
  return {
    ...version,
    tags: readAssetTags(version.tags),
    createdAt: version.createdAt.toISOString(),
  };
}

export function assetVersionSnapshot(
  asset: {
    id: string;
    version: number;
    title: string;
    summary: string;
    solution: string;
    rootCauseText: string | null;
    tags: unknown;
    status: AssetStatus;
  },
  changedBy: string,
) {
  return {
    assetId: asset.id,
    version: asset.version,
    title: asset.title,
    summary: asset.summary,
    solution: asset.solution,
    rootCauseText: asset.rootCauseText,
    tags: readAssetTags(asset.tags),
    status: asset.status,
    changedBy,
  };
}

const VERSION_FIELD_LABELS = {
  title: "标题",
  summary: "摘要",
  solution: "解决方案",
  rootCauseText: "根因说明",
  tags: "标签",
  status: "状态",
} as const;

export function buildAssetVersionDiff(
  before: AssetVersionDTO | null,
  after: AssetVersionDTO,
): AssetVersionDiffChange[] {
  if (!before) return [];
  const changes: AssetVersionDiffChange[] = [];
  for (const field of Object.keys(VERSION_FIELD_LABELS) as Array<
    keyof typeof VERSION_FIELD_LABELS
  >) {
    const beforeValue = before[field];
    const afterValue = after[field];
    const equal = Array.isArray(beforeValue) && Array.isArray(afterValue)
      ? beforeValue.length === afterValue.length
        && beforeValue.every((value, index) => value === afterValue[index])
      : beforeValue === afterValue;
    if (!equal) {
      changes.push({
        field,
        label: VERSION_FIELD_LABELS[field],
        before: beforeValue,
        after: afterValue,
      });
    }
  }
  return changes;
}

export function canTransitionAssetStatus(
  from: AssetStatus,
  to: AssetStatus,
  access: { canEdit: boolean; canAdmin: boolean },
): boolean {
  if (from === to) return false;
  if (from === "DRAFT" && to === "REVIEW") return access.canEdit;
  if (
    from === "REVIEW"
    && (to === "DRAFT" || to === "PUBLISHED")
  ) {
    return access.canAdmin;
  }
  if (to === "ARCHIVED" && from !== "ARCHIVED") return access.canAdmin;
  if (from === "ARCHIVED" && to === "DRAFT") return access.canAdmin;
  return false;
}

export function canRollbackAsset(
  status: AssetStatus,
  access: { canEdit: boolean; canAdmin: boolean },
): boolean {
  return access.canAdmin
    || (access.canEdit && (status === "DRAFT" || status === "REVIEW"));
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
