"use client";

import type { MatrixResponse } from "@/types";

interface Props {
  data: MatrixResponse;
}

export default function MatrixView({ data }: Props) {
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
              <td className="py-2 font-mono text-xs">{row.caseNo}</td>
              <td className="py-2">{row.name}</td>
              {data.batches.map((b) => {
                const result = row.results[b.id] || "-";
                return (
                  <td key={b.id} className={`py-2 px-2 ${result === "PASS" ? "text-green-600" : result === "FAIL" ? "text-red-600" : result === "BLOCK" ? "text-yellow-600" : "text-gray-400"}`}>
                    {result}
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