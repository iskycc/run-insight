"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

type Snapshot = {
  id: string;
  reportName: string;
  reportType: "QUALITY_GATE" | "ASSIGNEE" | "TREND";
  periodKey: string;
  generatedAt: string;
  summary: unknown;
  project: { id: string; name: string };
  scheduledReport: { id: string; cadence: string; timezone: string };
};

function Summary({ value }: { value: unknown }) {
  if (typeof value !== "object" || value === null) {
    return <p>{String(value)}</p>;
  }
  const record = value as Record<string, unknown>;
  const rows =
    Array.isArray(record.stats)
      ? record.stats
      : Array.isArray(record.trends)
        ? record.trends
        : null;
  if (rows) {
    const columns = Array.from(
      new Set(
        rows.flatMap((row) =>
          typeof row === "object" && row !== null ? Object.keys(row) : [],
        ),
      ),
    );
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-border px-3 py-2 text-left font-medium text-text-secondary">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const values =
                typeof row === "object" && row !== null
                  ? row as Record<string, unknown>
                  : {};
              return (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column} className="border-b border-border/60 px-3 py-2 text-text-primary">
                      {typeof values[column] === "object"
                        ? JSON.stringify(values[column])
                        : String(values[column] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {Object.entries(record).map(([key, item]) => (
        <div key={key} className="rounded-xl bg-bg p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">{key}</dt>
          <dd className="mt-1 break-words text-sm text-text-primary">
            {typeof item === "object" ? JSON.stringify(item, null, 2) : String(item)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ReportSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/report-snapshots/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { snapshot?: Snapshot; message?: string };
        if (!response.ok || !body.snapshot) throw new Error(body.message ?? "快照加载失败");
        if (!cancelled) setSnapshot(body.snapshot);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "快照加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <main className="mx-auto max-w-4xl px-4 py-12"><p role="alert" className="text-danger">{error}</p></main>;
  }
  if (!snapshot) {
    return <main className="mx-auto max-w-4xl px-4 py-12 text-text-secondary">加载中…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <Link href="/reports/scheduled" className="text-sm text-accent">← 返回定时报表</Link>
        <div className="flex gap-2">
          <a
            href={`/api/report-snapshots/${snapshot.id}/download?format=json`}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary"
          >
            下载 JSON
          </a>
          <a
            href={`/api/report-snapshots/${snapshot.id}/download?format=csv`}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary"
          >
            下载 CSV
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-accent px-3 py-2 text-sm text-white"
          >
            打印
          </button>
        </div>
      </div>
      <article className="rounded-2xl border border-border bg-surface-solid p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-border pb-5">
          <p className="text-sm text-text-secondary">{snapshot.project.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">{snapshot.reportName}</h1>
          <p className="mt-2 text-xs text-text-secondary">
            {snapshot.reportType} · 周期 {snapshot.periodKey} · 生成于{" "}
            {new Date(snapshot.generatedAt).toLocaleString("zh-CN", {
              timeZone: snapshot.scheduledReport.timezone,
            })}{" "}
            ({snapshot.scheduledReport.timezone})
          </p>
        </header>
        <section className="mt-6" aria-label="报表摘要">
          <Summary value={snapshot.summary} />
        </section>
      </article>
    </main>
  );
}
