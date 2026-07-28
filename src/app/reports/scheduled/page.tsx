"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/shared/Select";
import { Input } from "@/components/shared/Input";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/shared/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatDateTime } from "@/lib/date-time";
import { CalendarDots } from "@phosphor-icons/react";

type Project = { id: string; name: string; archived: boolean };
type SnapshotLink = { id: string; generatedAt: string };
type ScheduledReport = {
  id: string;
  name: string;
  type: "QUALITY_GATE" | "ASSIGNEE" | "TREND";
  cadence: "DAILY" | "WEEKLY";
  timezone: string;
  runHour: number;
  runMinute: number;
  weekDay: number;
  nextRunAt: string;
  lastRunAt: string | null;
  active: boolean;
  lastError: string | null;
  project: Project;
  snapshots: SnapshotLink[];
};

const TYPE_LABELS: Record<ScheduledReport["type"], string> = {
  QUALITY_GATE: "质量门禁",
  ASSIGNEE: "责任人",
  TREND: "趋势",
};
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "content-type": "application/json", ...init?.headers },
    ...init,
  });
  const body = await response.json() as { message?: string } & T;
  if (!response.ok) throw new Error(body.message ?? "请求失败");
  return body;
}

export default function ScheduledReportsPage() {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<ScheduledReport["type"]>("QUALITY_GATE");
  const [cadence, setCadence] = useState<ScheduledReport["cadence"]>("DAILY");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
  );
  const [runTime, setRunTime] = useState("09:00");
  const [weekDay, setWeekDay] = useState(1);
  const [trendLimit, setTrendLimit] = useState(10);
  const [minPassRate, setMinPassRate] = useState(95);

  const activeProjects = useMemo(
    () => projects.filter((project) => !project.archived),
    [projects],
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [reportData, projectData] = await Promise.all([
        jsonRequest<{ reports: ScheduledReport[] }>("/api/scheduled-reports"),
        jsonRequest<{ projects: Project[] }>("/api/projects"),
      ]);
      setReports(reportData.reports);
      setProjects(projectData.projects);
      setProjectId((current) => current || projectData.projects.find((p) => !p.archived)?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  const createReport = async (event: React.FormEvent) => {
    event.preventDefault();
    const [hour, minute] = runTime.split(":").map(Number);
    const config =
      type === "QUALITY_GATE"
        ? { minPassRate }
        : type === "TREND"
          ? { limit: trendLimit }
          : {};
    setSubmitting(true);
    setError("");
    try {
      await jsonRequest("/api/scheduled-reports", {
        method: "POST",
        body: JSON.stringify({
          name,
          projectId,
          type,
          config,
          cadence,
          timezone,
          runHour: hour,
          runMinute: minute,
          weekDay,
        }),
      });
      setName("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const updateActive = async (report: ScheduledReport, active: boolean) => {
    setError("");
    try {
      await jsonRequest(`/api/scheduled-reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新失败");
    }
  };

  const runNow = async (report: ScheduledReport) => {
    setError("");
    try {
      const data = await jsonRequest<{ snapshot: { id: string } }>(
        `/api/scheduled-reports/${report.id}/run`,
        { method: "POST" },
      );
      window.location.assign(`/reports/snapshots/${data.snapshot.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败");
    }
  };

  return (
    <PageContainer
      title="定时报表"
      subtitle="按项目时区自动保存不可变快照，也可以随时手动生成"
    >
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-[12px] border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <section className="bento-panel mb-8 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-text-primary">新建计划</h2>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          选择项目、频率和执行时间，系统会按计划生成可追溯的报表快照。
        </p>
        <form
          onSubmit={createReport}
          className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <Input
            label="名称"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：每日质量概览"
          />
          <Select
            label="项目"
            required
            value={projectId}
            placeholder="请选择"
            onChange={(event) => setProjectId(event.target.value)}
            options={activeProjects.map((project) => ({
              value: project.id,
              label: project.name,
            }))}
          />
          <Select
            label="报表类型"
            value={type}
            onChange={(event) => setType(event.target.value as ScheduledReport["type"])}
            options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="频率"
            value={cadence}
            onChange={(event) => setCadence(event.target.value as ScheduledReport["cadence"])}
            options={[
              { value: "DAILY", label: "每天" },
              { value: "WEEKLY", label: "每周" },
            ]}
          />
          <Input
            label="时区"
            required
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Asia/Shanghai"
          />
          <Input
            label="执行时间"
            type="time"
            required
            value={runTime}
            onChange={(event) => setRunTime(event.target.value)}
          />
          {cadence === "WEEKLY" && (
            <Select
              label="每周"
              value={weekDay}
              onChange={(event) => setWeekDay(Number(event.target.value))}
              options={WEEKDAY_LABELS.map((label, value) => ({ value, label }))}
            />
          )}
          {type === "QUALITY_GATE" && (
            <Input
              label="最低通过率（%）"
              type="number"
              min={0}
              max={100}
              value={minPassRate}
              onChange={(event) => setMinPassRate(Number(event.target.value))}
            />
          )}
          {type === "TREND" && (
            <Input
              label="最近批次数"
              type="number"
              min={1}
              max={30}
              value={trendLimit}
              onChange={(event) => setTrendLimit(Number(event.target.value))}
            />
          )}
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={!projectId}
              loading={submitting}
              loadingLabel="创建中…"
              className="w-full"
            >
              创建定时报表
            </Button>
          </div>
        </form>
      </section>

      <section aria-label="定时报表列表">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">已创建计划</h2>
          <p className="mt-1 text-xs text-text-secondary">
            查看运行状态、最近快照和下一次执行时间
          </p>
        </div>
        {loading ? (
          <LoadingState label="正在加载定时报表" rows={4} />
        ) : reports.length === 0 ? (
          <div className="bento-panel">
            <EmptyState
              title="暂无定时报表"
              description="填写上方计划信息后，系统会在这里展示运行状态和历史快照。"
              icon={<CalendarDots size={44} weight="duotone" aria-hidden="true" />}
            />
          </div>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <article key={report.id} className="bento-panel p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-text-primary">{report.name}</h2>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          report.active
                            ? "bg-success/10 text-success"
                            : "bg-bg text-text-secondary"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            report.active ? "bg-success" : "bg-text-secondary/50"
                          }`}
                          aria-hidden="true"
                        />
                        {report.active ? "运行中" : "已停用"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      {report.project.name} · {TYPE_LABELS[report.type]} ·
                      {report.cadence === "DAILY" ? " 每天" : ` ${WEEKDAY_LABELS[report.weekDay]}`}{" "}
                      {String(report.runHour).padStart(2, "0")}:{String(report.runMinute).padStart(2, "0")} ({report.timezone})
                    </p>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      下次执行：{formatDateTime(report.nextRunAt)}
                      {report.lastRunAt ? ` · 上次：${formatDateTime(report.lastRunAt)}` : ""}
                    </p>
                    {report.lastError && (
                      <p
                        role="status"
                        className="mt-3 rounded-[10px] bg-danger/8 px-3 py-2 text-xs text-danger"
                      >
                        上次失败：{report.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {report.snapshots[0] && (
                      <Link
                        href={`/reports/snapshots/${report.snapshots[0].id}`}
                        className="inline-flex h-9 items-center justify-center rounded-[10px] border border-border bg-bg px-3 text-xs font-medium text-text-primary transition-colors hover:border-accent/25 hover:bg-surface-solid hover:text-text-primary"
                      >
                        最新快照
                      </Link>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void runNow(report)}
                    >
                      立即运行
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={report.active ? "danger" : "primary"}
                      onClick={() => void updateActive(report, !report.active)}
                    >
                      {report.active ? "停用" : "启用"}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
