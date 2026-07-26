import {
  getNextRunAt,
  getNextRunAfterOccurrence,
  validateScheduledReportInput,
} from "@/lib/scheduled-reports";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("scheduled report validation and calendar", () => {
  const valid = {
    name: "每日质量",
    projectId: "project_1",
    type: "QUALITY_GATE",
    config: { minPassRate: 95 },
    cadence: "DAILY",
    timezone: "Asia/Shanghai",
  };

  it("accepts only report-specific config keys", () => {
    expect(validateScheduledReportInput(valid).ok).toBe(true);
    const result = validateScheduledReportInput({
      ...valid,
      config: { minPassRate: 95, arbitraryQuery: "DROP" },
    });
    expect(result).toEqual({
      ok: false,
      message: "config 不支持字段 arbitraryQuery",
    });
  });

  it("rejects invalid timezones and body keys", () => {
    expect(
      validateScheduledReportInput({ ...valid, timezone: "Moon/Base" }),
    ).toEqual({
      ok: false,
      message: "timezone 不是有效的 IANA 时区",
    });
    expect(
      validateScheduledReportInput({ ...valid, ownerId: "other" }),
    ).toEqual({ ok: false, message: "不支持字段 ownerId" });
  });

  it("moves a nonexistent spring-forward wall time to the first valid minute", () => {
    const next = getNextRunAt(
      {
        cadence: "DAILY",
        timezone: "America/New_York",
        runHour: 2,
        runMinute: 30,
        weekDay: 0,
      },
      new Date("2026-03-07T08:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });

  it("uses the second repeated wall time when the first is already past", () => {
    const next = getNextRunAt(
      {
        cadence: "DAILY",
        timezone: "America/New_York",
        runHour: 1,
        runMinute: 30,
        weekDay: 0,
      },
      new Date("2026-11-01T05:45:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });

  it("advances a completed fall-back occurrence to the next local day", () => {
    const next = getNextRunAfterOccurrence(
      {
        cadence: "DAILY",
        timezone: "America/New_York",
        runHour: 1,
        runMinute: 30,
        weekDay: 0,
      },
      new Date("2026-11-01T05:30:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-11-02T06:30:00.000Z");
  });
});
