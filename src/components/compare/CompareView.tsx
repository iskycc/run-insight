"use client";

import { useState } from "react";
import type { CompareResponse } from "@/types";

interface Props {
  data: CompareResponse;
}

export default function CompareView({ data }: Props) {
  const [activeTab, setActiveTab] = useState<"passToFail" | "failToPass" | "newInB" | "removedFromB">("passToFail");

  const tabs = [
    { key: "passToFail" as const, label: `PASS→FAIL (${data.diff.passToFail.length})` },
    { key: "failToPass" as const, label: `FAIL→PASS (${data.diff.failToPass.length})` },
    { key: "newInB" as const, label: `新增 (${data.diff.newInB.length})` },
    { key: "removedFromB" as const, label: `移除 (${data.diff.removedFromB.length})` },
  ];

  const items = data.diff[activeTab];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
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
              <tr key={i} className="border-b">
                <td className="py-2 font-mono text-xs">{item.caseNo}</td>
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