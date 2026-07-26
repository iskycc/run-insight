import { randomUUID } from "node:crypto";
import type {
  ReportCadence,
  ScheduledReportType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type QualityGateReportConfig = {
  batchId?: string;
  minPassRate?: number;
  maxFailCount?: number;
  maxBlockCount?: number;
  maxPendingCount?: number;
};

export type AssigneeReportConfig = {
  testStageId?: string;
  batchScopeId?: string;
};

export type TrendReportConfig = {
  limit?: number;
};

export type ScheduledReportConfig =
  | QualityGateReportConfig
  | AssigneeReportConfig
  | TrendReportConfig;

export type ScheduledReportInput = {
  name: string;
  projectId: string;
  type: ScheduledReportType;
  config: ScheduledReportConfig;
  cadence: ReportCadence;
  timezone: string;
  runHour: number;
  runMinute: number;
  weekDay: number;
  active: boolean;
};

type ValidationResult =
  | { ok: true; value: ScheduledReportInput }
  | { ok: false; message: string };

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const QUALITY_GATE_KEYS = new Set([
  "batchId",
  "minPassRate",
  "maxFailCount",
  "maxBlockCount",
  "maxPendingCount",
]);
const ASSIGNEE_KEYS = new Set(["testStageId", "batchScopeId"]);
const TREND_KEYS = new Set(["limit"]);
const DEFAULT_THRESHOLDS = {
  minPassRate: 95,
  maxFailCount: 0,
  maxBlockCount: 0,
  maxPendingCount: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined | null {
  const value = input[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 191) return null;
  return value;
}

function optionalNumber(
  input: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  integer = false,
): number | undefined | null {
  const value = input[key];
  if (value === undefined) return undefined;
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
    || (integer && !Number.isSafeInteger(value))
  ) {
    return null;
  }
  return value;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function parseConfig(
  type: ScheduledReportType,
  configValue: unknown,
): { ok: true; value: ScheduledReportConfig } | { ok: false; message: string } {
  if (!isRecord(configValue)) {
    return { ok: false, message: "config 必须是对象" };
  }
  const allowed =
    type === "QUALITY_GATE"
      ? QUALITY_GATE_KEYS
      : type === "ASSIGNEE"
        ? ASSIGNEE_KEYS
        : TREND_KEYS;
  const unknownKey = Object.keys(configValue).find((key) => !allowed.has(key));
  if (unknownKey) {
    return { ok: false, message: `config 不支持字段 ${unknownKey}` };
  }

  if (type === "QUALITY_GATE") {
    const batchId = optionalString(configValue, "batchId");
    const minPassRate = optionalNumber(configValue, "minPassRate", 0, 100);
    const maxFailCount = optionalNumber(
      configValue,
      "maxFailCount",
      0,
      1_000_000,
      true,
    );
    const maxBlockCount = optionalNumber(
      configValue,
      "maxBlockCount",
      0,
      1_000_000,
      true,
    );
    const maxPendingCount = optionalNumber(
      configValue,
      "maxPendingCount",
      0,
      1_000_000,
      true,
    );
    if (
      batchId === null
      || minPassRate === null
      || maxFailCount === null
      || maxBlockCount === null
      || maxPendingCount === null
    ) {
      return { ok: false, message: "质量门禁 config 参数无效" };
    }
    return {
      ok: true,
      value: {
        ...(batchId ? { batchId } : {}),
        ...(minPassRate === undefined ? {} : { minPassRate }),
        ...(maxFailCount === undefined ? {} : { maxFailCount }),
        ...(maxBlockCount === undefined ? {} : { maxBlockCount }),
        ...(maxPendingCount === undefined ? {} : { maxPendingCount }),
      },
    };
  }

  if (type === "ASSIGNEE") {
    const testStageId = optionalString(configValue, "testStageId");
    const batchScopeId = optionalString(configValue, "batchScopeId");
    if (testStageId === null || batchScopeId === null) {
      return { ok: false, message: "责任人报表 config 参数无效" };
    }
    return {
      ok: true,
      value: {
        ...(testStageId ? { testStageId } : {}),
        ...(batchScopeId ? { batchScopeId } : {}),
      },
    };
  }

  const limit = optionalNumber(configValue, "limit", 1, 30, true);
  if (limit === null) {
    return { ok: false, message: "趋势报表 limit 必须是 1 到 30 的整数" };
  }
  return {
    ok: true,
    value: limit === undefined ? {} : { limit },
  };
}

export function validateScheduledReportInput(
  input: unknown,
  defaults?: Partial<ScheduledReportInput>,
): ValidationResult {
  if (!isRecord(input)) return { ok: false, message: "请求体必须是对象" };
  const allowedBodyKeys = new Set([
    "name",
    "projectId",
    "type",
    "config",
    "cadence",
    "timezone",
    "runHour",
    "runMinute",
    "weekDay",
    "active",
  ]);
  const unknownKey = Object.keys(input).find((key) => !allowedBodyKeys.has(key));
  if (unknownKey) {
    return { ok: false, message: `不支持字段 ${unknownKey}` };
  }

  const name = input.name ?? defaults?.name;
  const projectId = input.projectId ?? defaults?.projectId;
  const type = input.type ?? defaults?.type;
  const config = input.config ?? defaults?.config ?? {};
  const cadence = input.cadence ?? defaults?.cadence;
  const timezone = input.timezone ?? defaults?.timezone;
  const runHour = input.runHour ?? defaults?.runHour ?? 9;
  const runMinute = input.runMinute ?? defaults?.runMinute ?? 0;
  const weekDay = input.weekDay ?? defaults?.weekDay ?? 1;
  const active = input.active ?? defaults?.active ?? true;

  if (
    typeof name !== "string"
    || name.trim().length === 0
    || name.trim().length > 100
  ) {
    return { ok: false, message: "名称长度必须为 1 到 100 个字符" };
  }
  if (typeof projectId !== "string" || !projectId.trim()) {
    return { ok: false, message: "projectId 为必填字段" };
  }
  if (!["QUALITY_GATE", "ASSIGNEE", "TREND"].includes(String(type))) {
    return { ok: false, message: "报表类型无效" };
  }
  if (!["DAILY", "WEEKLY"].includes(String(cadence))) {
    return { ok: false, message: "执行频率无效" };
  }
  if (typeof timezone !== "string" || !isValidTimeZone(timezone)) {
    return { ok: false, message: "timezone 不是有效的 IANA 时区" };
  }
  if (!Number.isInteger(runHour) || Number(runHour) < 0 || Number(runHour) > 23) {
    return { ok: false, message: "runHour 必须是 0 到 23 的整数" };
  }
  if (
    !Number.isInteger(runMinute)
    || Number(runMinute) < 0
    || Number(runMinute) > 59
  ) {
    return { ok: false, message: "runMinute 必须是 0 到 59 的整数" };
  }
  if (!Number.isInteger(weekDay) || Number(weekDay) < 0 || Number(weekDay) > 6) {
    return { ok: false, message: "weekDay 必须是 0 到 6 的整数" };
  }
  if (typeof active !== "boolean") {
    return { ok: false, message: "active 必须是布尔值" };
  }

  const parsedConfig = parseConfig(type as ScheduledReportType, config);
  if (!parsedConfig.ok) return parsedConfig;
  return {
    ok: true,
    value: {
      name: name.trim(),
      projectId: projectId.trim(),
      type: type as ScheduledReportType,
      config: parsedConfig.value,
      cadence: cadence as ReportCadence,
      timezone,
      runHour: Number(runHour),
      runMinute: Number(runMinute),
      weekDay: Number(weekDay),
      active,
    },
  };
}

export async function validateReportConfigScope(
  projectId: string,
  type: ScheduledReportType,
  config: ScheduledReportConfig,
): Promise<string | null> {
  if (type === "QUALITY_GATE") {
    const qualityConfig = config as QualityGateReportConfig;
    if (!qualityConfig.batchId) return null;
    const batch = await prisma.batchScope.findUnique({
      where: { id: qualityConfig.batchId },
      select: { projectId: true },
    });
    return batch?.projectId === projectId ? null : "批跑不属于指定项目";
  }
  if (type !== "ASSIGNEE") return null;

  const assigneeConfig = config as AssigneeReportConfig;
  const [stage, batch] = await Promise.all([
    assigneeConfig.testStageId
      ? prisma.testStage.findUnique({
          where: { id: assigneeConfig.testStageId },
          select: { projectId: true },
        })
      : Promise.resolve(null),
    assigneeConfig.batchScopeId
      ? prisma.batchScope.findUnique({
          where: { id: assigneeConfig.batchScopeId },
          select: { projectId: true, testStageId: true },
        })
      : Promise.resolve(null),
  ]);
  if (assigneeConfig.testStageId && stage?.projectId !== projectId) {
    return "阶段不属于指定项目";
  }
  if (assigneeConfig.batchScopeId && batch?.projectId !== projectId) {
    return "批跑不属于指定项目";
  }
  if (
    assigneeConfig.testStageId
    && batch
    && batch.testStageId !== assigneeConfig.testStageId
  ) {
    return "批跑不属于指定阶段";
  }
  return null;
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function addCalendarDays(
  date: Pick<ZonedParts, "year" | "month" | "day">,
  days: number,
) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function localWeekDay(date: Pick<ZonedParts, "year" | "month" | "day">) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function possibleInstantsForLocalTime(
  localDate: Pick<ZonedParts, "year" | "month" | "day">,
  hour: number,
  minute: number,
  timezone: string,
): Date[] {
  const desiredEpoch = Date.UTC(
    localDate.year,
    localDate.month - 1,
    localDate.day,
    hour,
    minute,
  );
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const sample = new Date(desiredEpoch + delta * 60 * 60 * 1000);
    const local = getZonedParts(sample, timezone);
    offsets.add(
      Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second,
      ) - sample.getTime(),
    );
  }
  const exact = Array.from(offsets)
    .map((offset) => new Date(desiredEpoch - offset))
    .filter((candidate) => {
      const local = getZonedParts(candidate, timezone);
      return (
        local.year === localDate.year
        && local.month === localDate.month
        && local.day === localDate.day
        && local.hour === hour
        && local.minute === minute
      );
    })
    .sort((left, right) => left.getTime() - right.getTime());
  if (exact.length > 0) return exact;

  // A spring-forward gap has no exact instant. Match cron behavior by using
  // the first real local minute after the requested wall-clock time.
  for (let deltaMinutes = -16 * 60; deltaMinutes <= 16 * 60; deltaMinutes += 1) {
    const candidate = new Date(desiredEpoch + deltaMinutes * 60 * 1000);
    const local = getZonedParts(candidate, timezone);
    if (
      local.year === localDate.year
      && local.month === localDate.month
      && local.day === localDate.day
      && local.hour * 60 + local.minute >= hour * 60 + minute
    ) {
      return [candidate];
    }
  }
  throw new Error("无法计算下次执行时间");
}

export function getNextRunAt(
  schedule: Pick<
    ScheduledReportInput,
    "cadence" | "timezone" | "runHour" | "runMinute" | "weekDay"
  >,
  after = new Date(),
): Date {
  const localNow = getZonedParts(after, schedule.timezone);
  for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
    const localDate = addCalendarDays(localNow, dayOffset);
    if (
      schedule.cadence === "WEEKLY"
      && localWeekDay(localDate) !== schedule.weekDay
    ) {
      continue;
    }
    const candidates = possibleInstantsForLocalTime(
      localDate,
      schedule.runHour,
      schedule.runMinute,
      schedule.timezone,
    );
    const next = candidates.find((candidate) => candidate.getTime() > after.getTime());
    if (next) return next;
  }
  throw new Error("无法计算下次执行时间");
}

export function getNextRunAfterOccurrence(
  schedule: Pick<
    ScheduledReportInput,
    "cadence" | "timezone" | "runHour" | "runMinute" | "weekDay"
  >,
  occurrence: Date,
): Date {
  const localOccurrence = getZonedParts(occurrence, schedule.timezone);
  const nextDate = addCalendarDays(
    localOccurrence,
    schedule.cadence === "DAILY" ? 1 : 7,
  );
  return possibleInstantsForLocalTime(
    nextDate,
    schedule.runHour,
    schedule.runMinute,
    schedule.timezone,
  )[0];
}

export function getReportPeriodKey(
  scheduledFor: Date,
  timezone: string,
): string {
  const parts = getZonedParts(scheduledFor, timezone);
  return [parts.year, String(parts.month).padStart(2, "0"), String(parts.day).padStart(2, "0")].join("-");
}

function percentage(part: number, total: number) {
  return total === 0 ? 0 : Number(((part / total) * 100).toFixed(1));
}

function countResult(
  groups: Array<{ resultSummary: string; _count: { _all: number } }>,
  resultSummary: string,
) {
  return groups.find((group) => group.resultSummary === resultSummary)?._count._all ?? 0;
}

async function buildQualityGateSummary(
  projectId: string,
  config: QualityGateReportConfig,
) {
  const batch = config.batchId
    ? await prisma.batchScope.findFirst({
        where: { id: config.batchId, projectId },
        include: { stage: { select: { archived: true } } },
      })
    : await prisma.batchScope.findFirst({
        where: { projectId, archived: false, stage: { archived: false } },
        include: { stage: { select: { archived: true } } },
        orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
      });
  if (!batch) throw new Error("没有可用于质量门禁的批跑");
  if (batch.archived || batch.stage.archived) {
    throw new Error("已归档阶段或批跑不能生成质量门禁");
  }

  const baseline = await prisma.batchScope.findFirst({
    where: {
      projectId,
      testStageId: batch.testStageId,
      archived: false,
      OR: [
        { executedAt: { lt: batch.executedAt } },
        {
          executedAt: batch.executedAt,
          createdAt: { lt: batch.createdAt },
        },
      ],
    },
    orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
  });
  const [groups, pendingCount, baselineGroups] = await Promise.all([
    prisma.caseResult.groupBy({
      by: ["resultSummary"],
      where: { batchScopeId: batch.id },
      _count: { _all: true },
    }),
    prisma.caseResult.count({
      where: { batchScopeId: batch.id, progressCategory: "PENDING" },
    }),
    baseline
      ? prisma.caseResult.groupBy({
          by: ["resultSummary"],
          where: { batchScopeId: baseline.id },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const totalCount = groups.reduce((sum, group) => sum + group._count._all, 0);
  const passCount = countResult(groups, "PASS");
  const failCount = countResult(groups, "FAIL");
  const blockCount = countResult(groups, "BLOCK");
  const passRate = percentage(passCount, totalCount);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...config };
  delete (thresholds as Partial<QualityGateReportConfig>).batchId;
  const checks = [
    {
      metric: "minPassRate",
      actual: passRate,
      threshold: thresholds.minPassRate,
      passed: passRate >= thresholds.minPassRate,
    },
    {
      metric: "maxFailCount",
      actual: failCount,
      threshold: thresholds.maxFailCount,
      passed: failCount <= thresholds.maxFailCount,
    },
    {
      metric: "maxBlockCount",
      actual: blockCount,
      threshold: thresholds.maxBlockCount,
      passed: blockCount <= thresholds.maxBlockCount,
    },
    {
      metric: "maxPendingCount",
      actual: pendingCount,
      threshold: thresholds.maxPendingCount,
      passed: pendingCount <= thresholds.maxPendingCount,
    },
  ];
  const baselineTotal = baselineGroups.reduce(
    (sum, group) => sum + group._count._all,
    0,
  );
  const baselinePassRate = percentage(
    countResult(baselineGroups, "PASS"),
    baselineTotal,
  );
  return {
    passed: checks.every((check) => check.passed),
    thresholds,
    batch: {
      id: batch.id,
      name: batch.name,
      testStageId: batch.testStageId,
      executedAt: batch.executedAt.toISOString(),
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
    comparison: baseline
      ? {
          baselineBatchId: baseline.id,
          baselineBatchName: baseline.name,
          baselinePassRate,
          delta: Number((passRate - baselinePassRate).toFixed(1)),
        }
      : null,
  };
}

async function buildAssigneeSummary(
  projectId: string,
  config: AssigneeReportConfig,
) {
  const where = {
    projectId,
    ...(config.testStageId ? { testStageId: config.testStageId } : {}),
    ...(config.batchScopeId ? { batchScopeId: config.batchScopeId } : {}),
    assignee: { not: null },
  };
  const [totals, failures, fixed, saved] = await Promise.all([
    prisma.caseResult.groupBy({
      by: ["assignee"],
      where,
      _count: { _all: true },
    }),
    prisma.caseResult.groupBy({
      by: ["assignee"],
      where: { ...where, resultSummary: "FAIL" },
      _count: { _all: true },
    }),
    prisma.caseResult.groupBy({
      by: ["assignee"],
      where: { ...where, progressCategory: "FIXED" },
      _count: { _all: true },
    }),
    prisma.caseResult.groupBy({
      by: ["assignee"],
      where: { ...where, assetSaved: true },
      _count: { _all: true },
    }),
  ]);
  const toMap = (
    groups: Array<{ assignee: string | null; _count: { _all: number } }>,
  ) => new Map(groups.map((group) => [group.assignee, group._count._all]));
  const failureMap = toMap(failures);
  const fixedMap = toMap(fixed);
  const savedMap = toMap(saved);
  const stats = totals
    .filter((group) => group.assignee !== null)
    .map((group) => {
      const assignee = group.assignee as string;
      const failCount = failureMap.get(assignee) ?? 0;
      const fixCount = fixedMap.get(assignee) ?? 0;
      return {
        assignee,
        totalCases: group._count._all,
        failCount,
        fixCount,
        savedAssetCount: savedMap.get(assignee) ?? 0,
        fixRate: failCount === 0 ? 0 : Number((fixCount / failCount).toFixed(2)),
      };
    })
    .sort(
      (left, right) =>
        right.failCount - left.failCount
        || left.assignee.localeCompare(right.assignee),
    );
  return { stats };
}

async function buildTrendSummary(projectId: string, config: TrendReportConfig) {
  const batches = await prisma.batchScope.findMany({
    where: { projectId },
    orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
    take: config.limit ?? 10,
  });
  const ids = batches.map((batch) => batch.id);
  if (ids.length === 0) return { trends: [] };
  const resultNames = ["PASS", "FAIL", "BLOCK", "SKIP"] as const;
  const [totals, analyzed, ...resultGroups] = await Promise.all([
    prisma.caseResult.groupBy({
      by: ["batchScopeId"],
      where: { batchScopeId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.caseResult.groupBy({
      by: ["batchScopeId"],
      where: {
        batchScopeId: { in: ids },
        progressCategory: { in: ["LOCATED", "FIXED", "NOT_ISSUE"] },
      },
      _count: { _all: true },
    }),
    ...resultNames.map((resultSummary) =>
      prisma.caseResult.groupBy({
        by: ["batchScopeId"],
        where: { batchScopeId: { in: ids }, resultSummary },
        _count: { _all: true },
      }),
    ),
  ]);
  const mapCounts = (
    groups: Array<{ batchScopeId: string; _count: { _all: number } }>,
  ) => new Map(groups.map((group) => [group.batchScopeId, group._count._all]));
  const totalMap = mapCounts(totals);
  const analyzedMap = mapCounts(analyzed);
  const [passMap, failMap, blockMap, skipMap] = resultGroups.map(mapCounts);
  return {
    trends: [...batches].reverse().map((batch) => {
      const total = totalMap.get(batch.id) ?? 0;
      const passed = passMap.get(batch.id) ?? 0;
      const failed = failMap.get(batch.id) ?? 0;
      return {
        batchId: batch.id,
        batch: batch.name,
        executedAt: batch.executedAt.toISOString(),
        total,
        passed,
        failed,
        blocked: blockMap.get(batch.id) ?? 0,
        skipped: skipMap.get(batch.id) ?? 0,
        passRate: percentage(passed, total),
        failRate: percentage(failed, total),
        analyzed: analyzedMap.get(batch.id) ?? 0,
      };
    }),
  };
}

export async function generateReportSummary(report: {
  projectId: string;
  type: ScheduledReportType;
  config: unknown;
}) {
  const parsed = parseConfig(report.type, report.config);
  if (!parsed.ok) throw new Error(parsed.message);
  if (report.type === "QUALITY_GATE") {
    return buildQualityGateSummary(
      report.projectId,
      parsed.value as QualityGateReportConfig,
    );
  }
  if (report.type === "ASSIGNEE") {
    return buildAssigneeSummary(
      report.projectId,
      parsed.value as AssigneeReportConfig,
    );
  }
  return buildTrendSummary(report.projectId, parsed.value as TrendReportConfig);
}

export function createClaimToken() {
  return randomUUID();
}
