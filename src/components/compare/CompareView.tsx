"use client";

import Link from "next/link";
import { useState } from "react";
import type { CompareResponse } from "@/types";

interface Props {
  data: CompareResponse;
  projectId?: string;
  stageId?: string;
}

type DiffTab = "passToFail" | "failToPass" | "otherChanges" | "newInB" | "removedFromB";

export default function CompareView({ data, projectId, stageId }: Props) {
  const [activeTab, setActiveTab] = useState<DiffTab>("passToFail");

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
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="变更分类">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1 rounded text-sm ${activeTab === tab.key ? "bg-blue-600 text-white" : "bg-gray-100"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="text-sm text-gray-500 mb-2">
        不变: {data.diff.unchanged} | 总计: {data.batchA.name}({data.batchA.caseCount}) vs {data.batchB.name}({data.batchB.caseCount})
      </div>
      {items.length === 0 ? (
        <p className="text-gray-400 text-sm">无差异项</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">用例编号</th>
              <th className="text-left py-2">名称</th>
              <th className="text-left py-2">{data.batchA.name}</th>
              <th className="text-left py-2">{data.batchB.name}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={`${item.caseNo}-${i}`} className="border-b">
                <td className="py-2 font-mono text-xs">
                  <Link
                    href={workspaceHref(item.caseNo)}
                    className="text-accent hover:underline"
                    aria-label={`在工作台查看用例 ${item.caseNo}`}
                  >
                    {item.caseNo}
                  </Link>
                </td>
                <td className="py-2">{item.name}</td>
                <td className="py-2">{item.resultA}</td>
                <td className="py-2">{item.resultB}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
