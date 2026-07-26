import {
  PROGRESS_CATEGORIES,
  RESULT_SUMMARIES,
  type SavedViewDTO,
  type SavedViewFilters,
  type SavedViewScope,
} from "@/types";

const FILTER_KEYS = [
  "projectId",
  "stageId",
  "batchScopeId",
  "progressCategory",
  "assetSaved",
  "search",
  "resultSummary",
  "assignee",
  "rootCause",
  "dateFrom",
  "dateTo",
] as const satisfies readonly (keyof SavedViewFilters)[];

const FILTER_KEY_SET = new Set<string>(FILTER_KEYS);
const ID_FILTERS = new Set<keyof SavedViewFilters>([
  "projectId",
  "stageId",
  "batchScopeId",
]);
const TEXT_FILTERS = new Set<keyof SavedViewFilters>([
  "search",
  "assignee",
  "rootCause",
]);

type ValidationResult =
  | { ok: true; filters: SavedViewFilters }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateSavedViewFilters(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return { ok: false, error: "视图筛选条件必须是对象" };
  }

  const unknownKey = Object.keys(value).find((key) => !FILTER_KEY_SET.has(key));
  if (unknownKey) {
    return { ok: false, error: `不支持的筛选字段：${unknownKey}` };
  }

  const filters: SavedViewFilters = {};
  for (const key of FILTER_KEYS) {
    const raw = value[key];
    if (raw === undefined || raw === "") continue;
    if (typeof raw !== "string") {
      return { ok: false, error: `筛选字段 ${key} 必须是字符串` };
    }
    const normalized = raw.trim();
    if (!normalized) continue;

    if (ID_FILTERS.has(key) && normalized.length > 191) {
      return {
        ok: false,
        error: `筛选字段 ${key} 长度不能超过191个字符`,
      };
    }
    if (TEXT_FILTERS.has(key) && normalized.length > 200) {
      return {
        ok: false,
        error: `筛选字段 ${key} 长度不能超过200个字符`,
      };
    }
    if (
      key === "progressCategory" &&
      !PROGRESS_CATEGORIES.includes(
        normalized as (typeof PROGRESS_CATEGORIES)[number],
      )
    ) {
      return { ok: false, error: "进展筛选值不合法" };
    }
    if (
      key === "resultSummary" &&
      !RESULT_SUMMARIES.includes(normalized as (typeof RESULT_SUMMARIES)[number])
    ) {
      return { ok: false, error: "结果概要筛选值不合法" };
    }
    if (
      key === "assetSaved" &&
      normalized !== "true" &&
      normalized !== "false"
    ) {
      return { ok: false, error: "资产状态筛选值不合法" };
    }
    if ((key === "dateFrom" || key === "dateTo") && !isIsoDate(normalized)) {
      return {
        ok: false,
        error: `筛选字段 ${key} 必须是有效的 YYYY-MM-DD 日期`,
      };
    }

    filters[key] = normalized;
  }

  if (filters.stageId && !filters.projectId) {
    return { ok: false, error: "保存测试阶段时必须同时保存项目" };
  }
  if (filters.batchScopeId && (!filters.projectId || !filters.stageId)) {
    return {
      ok: false,
      error: "保存批跑范围时必须同时保存项目和测试阶段",
    };
  }
  if (
    filters.dateFrom &&
    filters.dateTo &&
    filters.dateFrom > filters.dateTo
  ) {
    return { ok: false, error: "开始日期不能晚于结束日期" };
  }

  return { ok: true, filters };
}

export function savedViewFiltersToJson(
  filters: SavedViewFilters,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function validateSavedViewName(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const name = value.trim();
  return name.length <= 100 ? name : null;
}

export function isSavedViewScope(value: unknown): value is SavedViewScope {
  return value === "PERSONAL" || value === "PROJECT";
}

export function serializeSavedView(
  view: {
    id: string;
    ownerId: string;
    owner?: { username: string };
    projectId: string | null;
    name: string;
    filters: unknown;
    scope: SavedViewScope;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  requesterId: string,
  canManage: boolean,
  fallbackOwnerName?: string,
): SavedViewDTO {
  return {
    id: view.id,
    ownerId: view.ownerId,
    ownerName: view.owner?.username ?? fallbackOwnerName ?? "未知用户",
    projectId: view.projectId,
    name: view.name,
    filters: view.filters as SavedViewFilters,
    scope: view.scope,
    isDefault: view.isDefault,
    isOwner: view.ownerId === requesterId,
    canManage,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}
