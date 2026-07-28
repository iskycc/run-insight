"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/shared/Select";
import { Input } from "@/components/shared/Input";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/shared/Button";

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
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-medium text-accent">Reports</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-primary">
          定时报表
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          按项目时区自动保存不可变快照，或随时立即生成。
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <section className="mb-8 rounded-2xl border border-border bg-surface-solid p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary">新建计划</h2>
        <form onSubmit={createReport} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-text-secondary">
            名称
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-text-primary"
            />
          </label>
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
          <label className="text-sm text-text-secondary">
            时区
            <input
              required
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Asia/Shanghai"
              className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-text-primary"
            />
          </label>
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
            <label className="text-sm text-text-secondary">
              最低通过率（%）
              <input
                type="number"
                min={0}
                max={100}
                value={minPassRate}
                onChange={(event) => setMinPassRate(Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-text-primary"
              />
            </label>
          )}
          {type === "TREND" && (
            <label className="text-sm text-text-secondary">
              最近批次数
              <input
                type="number"
                min={1}
                max={30}
                value={trendLimit}
                onChange={(event) => setTrendLimit(Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-text-primary"
              />
            </label>
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
        {loading ? (
          <LoadingState label="正在加载定时报表" rows={4} className="my-3" />
        ) : reports.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-12 text-center text-text-secondary">
            暂无定时报表
          </p>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <article key={report.id} className="rounded-2xl border border-border bg-surface-solid p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-text-primary">{report.name}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${report.active ? "bg-success/10 text-success" : "bg-bg text-text-secondary"}`}>
                        {report.active ? "运行中" : "已停用"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">
                      {report.project.name} · {TYPE_LABELS[report.type]} ·
                      {report.cadence === "DAILY" ? " 每天" : ` ${WEEKDAY_LABELS[report.weekDay]}`}{" "}
                      {String(report.runHour).padStart(2, "0")}:{String(report.runMinute).padStart(2, "0")} ({report.timezone})
                    </p>
                    <p className="mt-2 text-xs text-text-secondary">
                      下次执行：{new Date(report.nextRunAt).toLocaleString("zh-CN")}
                      {report.lastRunAt ? ` · 上次：${new Date(report.lastRunAt).toLocaleString("zh-CN")}` : ""}
                    </p>
                    {report.lastError && (
                      <p className="mt-2 text-xs text-danger">上次失败：{report.lastError}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {report.snapshots[0] && (
                      <Link
                        href={`/reports/snapshots/${report.snapshots[0].id}`}
                        className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
                      >
                        最新快照
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => void runNow(report)}
                      className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
                    >
                      立即运行
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateActive(report, !report.active)}
                      className={`rounded-lg px-3 py-2 text-sm ${report.active ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"}`}
                    >
                      {report.active ? "停用" : "启用"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
