"use client";

import Link from "next/link";
import type { MatrixResponse } from "@/types";

interface Props {
  data: MatrixResponse;
  projectId?: string;
  stageId?: string;
}

export default function MatrixView({ data, projectId, stageId }: Props) {
  function workspaceHref(caseNo: string, batchScopeId: string) {
    const params = new URLSearchParams({ search: caseNo, batchScopeId });
    if (projectId) params.set("projectId", projectId);
    if (stageId) params.set("testStageId", stageId);
    return `/workspace?${params.toString()}`;
  }

  const firstBatchId = data.batches[0]?.id;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 sticky left-0 bg-white">用例编号</th>
            <th className="text-left py-2 sticky left-16 bg-white">名称</th>
            {data.batches.map((b) => (
              <th key={b.id} className="text-left py-2 px-2">{b.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.caseNo} className="border-b">
              <td className="py-2 font-mono text-xs">
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
              <td className="py-2">{row.name}</td>
              {data.batches.map((b) => {
                const result = row.results[b.id] || "-";
                return (
                  <td key={b.id} className={`py-2 px-2 ${result === "PASS" ? "text-green-600" : result === "FAIL" ? "text-red-600" : result === "BLOCK" ? "text-yellow-600" : "text-gray-400"}`}>
                    {result === "-" ? result : (
                      <Link
                        href={workspaceHref(row.caseNo, b.id)}
                        className="hover:underline"
                        aria-label={`查看 ${row.caseNo} 在 ${b.name} 的结果`}
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
  );
}
