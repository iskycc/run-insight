"use client";

import Link from "next/link";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { MatrixResponse } from "@/types";

interface Props {
  data: MatrixResponse;
  projectId?: string;
  stageId?: string;
}

function resultTone(result: string) {
  if (result === "PASS") return "bg-success/10 text-success";
  if (result === "FAIL") return "bg-danger/10 text-danger";
  if (result === "BLOCK") return "bg-warning/15 text-warning";
  return "bg-bg text-text-secondary";
}

export default function MatrixView({ data, projectId, stageId }: Props) {
  const isMobile = useIsMobile();

  function workspaceHref(caseNo: string, batchScopeId: string) {
    const params = new URLSearchParams({ search: caseNo, batchScopeId });
    if (projectId) params.set("projectId", projectId);
    if (stageId) params.set("testStageId", stageId);
    return `/workspace?${params.toString()}`;
  }

  const firstBatchId = data.batches[0]?.id;

  return (
    <div className="min-w-0">
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-bg/75 p-3">
          <p className="text-xs text-text-secondary">对比批跑</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{data.batches.length}</p>
        </div>
        <div className="rounded-xl bg-bg/75 p-3">
          <p className="text-xs text-text-secondary">用例总数</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{data.rows.length}</p>
        </div>
      </div>

      {isMobile ? (
      <div className="space-y-3">
        {data.rows.map((row) => (
          <article key={row.caseNo} className="rounded-xl border border-border bg-bg/35 p-3">
            <div>
              {firstBatchId ? (
                <Link
                  href={workspaceHref(row.caseNo, firstBatchId)}
                  className="break-all font-mono text-xs font-semibold text-accent hover:underline"
                  aria-label={`在工作台查看移动端用例 ${row.caseNo}`}
                >
                  {row.caseNo}
                </Link>
              ) : (
                <span className="font-mono text-xs text-text-secondary">{row.caseNo}</span>
              )}
              <p className="mt-1 text-sm font-medium text-text-primary">{row.name}</p>
            </div>
            <div className="mt-3 grid gap-2">
              {data.batches.map((batch) => {
                const result = row.results[batch.id] || "-";
                return (
                  <div key={batch.id} className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate text-xs text-text-secondary">{batch.name}</span>
                    {result === "-" ? (
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${resultTone(result)}`}>—</span>
                    ) : (
                      <Link
                        href={workspaceHref(row.caseNo, batch.id)}
                        className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:underline ${resultTone(result)}`}
                        aria-label={`移动端查看 ${row.caseNo} 在 ${batch.name} 的结果`}
                      >
                        {result}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      ) : (
      <div className="max-w-full overflow-x-auto rounded-xl border border-border">
        <table className="min-w-max text-sm">
          <thead className="bg-bg/80 text-xs text-text-secondary">
            <tr>
              <th className="sticky left-0 z-10 min-w-36 bg-bg px-4 py-3 text-left font-semibold">
                用例编号
              </th>
              <th className="min-w-56 px-4 py-3 text-left font-semibold">名称</th>
              {data.batches.map((batch) => (
                <th key={batch.id} className="min-w-32 px-3 py-3 text-left font-semibold">
                  {batch.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((row) => (
              <tr key={row.caseNo} className="transition hover:bg-bg/40">
                <td className="sticky left-0 z-10 bg-surface-solid px-4 py-3 font-mono text-xs">
                  {firstBatchId ? (
                    <Link
                      href={workspaceHref(row.caseNo, firstBatchId)}
                      className="text-accent hover:underline"
                      aria-label={`在工作台查看用例 ${row.caseNo}`}
                    >
                      {row.caseNo}
                    </Link>
                  ) : row.caseNo}
                </td>
                <td className="px-4 py-3 text-text-primary">{row.name}</td>
                {data.batches.map((batch) => {
                  const result = row.results[batch.id] || "-";
                  return (
                    <td key={batch.id} className="px-3 py-3">
                      {result === "-" ? (
                        <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${resultTone(result)}`}>—</span>
                      ) : (
                        <Link
                          href={workspaceHref(row.caseNo, batch.id)}
                          className={`rounded-lg px-2 py-1 text-xs font-semibold hover:underline ${resultTone(result)}`}
                          aria-label={`查看 ${row.caseNo} 在 ${batch.name} 的结果`}
                        >
                          {result}
                        </Link>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
