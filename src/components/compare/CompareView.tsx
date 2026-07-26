"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { CompareResponse } from "@/types";

interface Props {
  data: CompareResponse;
  projectId?: string;
  stageId?: string;
}

type DiffTab = "passToFail" | "failToPass" | "otherChanges" | "newInB" | "removedFromB";

function resultTone(result: string) {
  if (result === "PASS") return "bg-success/10 text-success";
  if (result === "FAIL") return "bg-danger/10 text-danger";
  if (result === "BLOCK") return "bg-warning/15 text-warning";
  return "bg-bg text-text-secondary";
}

export default function CompareView({ data, projectId, stageId }: Props) {
  const [activeTab, setActiveTab] = useState<DiffTab>("passToFail");
  const isMobile = useIsMobile();

  const tabs = [
    { key: "passToFail" as const, label: `PASS→FAIL (${data.diff.passToFail.length})` },
    { key: "failToPass" as const, label: `FAIL→PASS (${data.diff.failToPass.length})` },
    { key: "otherChanges" as const, label: `其他变更 (${data.diff.otherChanges.length})` },
    { key: "newInB" as const, label: `新增 (${data.diff.newInB.length})` },
    { key: "removedFromB" as const, label: `移除 (${data.diff.removedFromB.length})` },
  ];

  const items = data.diff[activeTab];
  const targetBatchId = activeTab === "removedFromB" ? data.batchA.id : data.batchB.id;

  function workspaceHref(caseNo: string) {
    const params = new URLSearchParams({ search: caseNo, batchScopeId: targetBatchId });
    if (projectId) params.set("projectId", projectId);
    if (stageId) params.set("testStageId", stageId);
    return `/workspace?${params.toString()}`;
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl bg-bg/75 p-4">
          <p className="text-xs font-semibold text-text-secondary">对比范围</p>
          <div className="mt-3 flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">{data.batchA.name}</p>
              <p className="mt-1 text-xs text-text-secondary">{data.batchA.caseCount} 个用例</p>
            </div>
            <span className="shrink-0 rounded-full bg-surface-solid px-3 py-1 text-xs font-semibold text-accent shadow-sm">
              VS
            </span>
            <div className="min-w-0 flex-1 text-right">
              <p className="truncate text-sm font-semibold text-text-primary">{data.batchB.name}</p>
              <p className="mt-1 text-xs text-text-secondary">{data.batchB.caseCount} 个用例</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-danger/10 p-4">
          <p className="text-xs font-semibold text-danger">新增失败</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
            {data.diff.passToFail.length}
          </p>
        </div>
        <div className="rounded-2xl bg-success/10 p-4">
          <p className="text-xs font-semibold text-success">恢复通过</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
            {data.diff.failToPass.length}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 overflow-x-auto pb-1" role="tablist" aria-label="变更分类">
          <div className="flex min-w-max rounded-xl bg-bg/75 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  activeTab === tab.key
                    ? "bg-surface-solid text-accent shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <span className="hidden shrink-0 text-xs text-text-secondary sm:inline">
          {data.diff.unchanged} 项无变化
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-bg/35 px-4 py-10 text-center">
          <p className="text-sm font-medium text-text-primary">此分类没有差异项</p>
          <p className="mt-1 text-xs text-text-secondary">可以切换上方分类查看其他变化。</p>
        </div>
      ) : (
        <>
          {isMobile ? (
          <div className="space-y-2">
            {items.map((item, i) => (
              <article key={`${item.caseNo}-${i}`} className="rounded-xl border border-border bg-bg/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={workspaceHref(item.caseNo)}
                    className="break-all font-mono text-xs font-semibold text-accent hover:underline"
                    aria-label={`在工作台查看移动端用例 ${item.caseNo}`}
                  >
                    {item.caseNo}
                  </Link>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-text-secondary">
                    查看
                    <ArrowRight size={13} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-primary">{item.name}</p>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <span className={`rounded-lg px-2 py-1 text-center text-xs font-semibold ${resultTone(item.resultA)}`}>
                    {item.resultA || "—"}
                  </span>
                  <ArrowRight size={14} aria-hidden="true" className="text-text-secondary" />
                  <span className={`rounded-lg px-2 py-1 text-center text-xs font-semibold ${resultTone(item.resultB)}`}>
                    {item.resultB || "—"}
                  </span>
                </div>
              </article>
            ))}
          </div>
          ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-bg/60 text-xs text-text-secondary">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">用例编号</th>
                  <th className="px-4 py-3 text-left font-semibold">名称</th>
                  <th className="px-4 py-3 text-left font-semibold">{data.batchA.name}</th>
                  <th className="px-4 py-3 text-left font-semibold">{data.batchB.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, i) => (
                  <tr key={`${item.caseNo}-${i}`} className="transition hover:bg-bg/40">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={workspaceHref(item.caseNo)}
                        className="text-accent hover:underline"
                        aria-label={`在工作台查看用例 ${item.caseNo}`}
                      >
                        {item.caseNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-primary">{item.name}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${resultTone(item.resultA)}`}>
                        {item.resultA || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${resultTone(item.resultB)}`}>
                        {item.resultB || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </div>
  );
}
