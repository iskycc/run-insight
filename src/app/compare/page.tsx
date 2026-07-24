"use client";

import { useState } from "react";
import CompareView from "@/components/compare/CompareView";
import MatrixView from "@/components/compare/MatrixView";
import type { CompareResponse, MatrixResponse } from "@/types";

export default function ComparePage() {
  const [projectId, setProjectId] = useState("");
  const [stageId, setStageId] = useState("");
  const [batchA, setBatchA] = useState("");
  const [batchB, setBatchB] = useState("");
  const [batchIds, setBatchIds] = useState("");
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [matrixData, setMatrixData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"compare" | "matrix">("compare");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);

  async function loadProjects() {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects || []);
    }
  }

  async function loadStages(pid: string) {
    setProjectId(pid);
    setStageId("");
    setBatchA("");
    setBatchB("");
    const res = await fetch(`/api/projects/${pid}/stages`);
    if (res.ok) {
      const data = await res.json();
      setStages(data.stages || []);
    }
    setBatches([]);
  }

  async function loadBatches(sid: string) {
    setStageId(sid);
    setBatchA("");
    setBatchB("");
    const res = await fetch(`/api/stages/${sid}/batches`);
    if (res.ok) {
      const data = await res.json();
      setBatches(data.batches || []);
    }
  }

  async function handleCompare() {
    if (!batchA || !batchB) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/stats/compare?batchA=${batchA}&batchB=${batchB}`);
    if (!res.ok) {
      const err = await res.json();
      setError(err.message || "对比失败");
    } else {
      setCompareData(await res.json());
    }
    setLoading(false);
  }

  async function handleMatrix() {
    if (!projectId || !stageId || !batchIds) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/stats/matrix?projectId=${projectId}&stageId=${stageId}&batchIds=${batchIds}`);
    if (!res.ok) {
      const err = await res.json();
      setError(err.message || "矩阵查询失败");
    } else {
      setMatrixData(await res.json());
    }
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">跨批跑对比</h1>

      <div className="flex gap-4 mb-4">
        <button onClick={() => setTab("compare")} className={`px-4 py-2 rounded ${tab === "compare" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>差异对比</button>
        <button onClick={() => setTab("matrix")} className={`px-4 py-2 rounded ${tab === "matrix" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>趋势矩阵</button>
      </div>

      {tab === "compare" ? (
        <div className="space-y-4">
          <div className="flex gap-4">
            <select className="border rounded px-3 py-2" value={projectId} onChange={(e) => loadStages(e.target.value)} onFocus={loadProjects}>
              <option value="">选择项目</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="border rounded px-3 py-2" value={stageId} onChange={(e) => loadBatches(e.target.value)} disabled={!projectId}>
              <option value="">选择阶段</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="border rounded px-3 py-2" value={batchA} onChange={(e) => setBatchA(e.target.value)} disabled={!stageId}>
              <option value="">选择批跑 A</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="border rounded px-3 py-2" value={batchB} onChange={(e) => setBatchB(e.target.value)} disabled={!stageId}>
              <option value="">选择批跑 B</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button onClick={handleCompare} disabled={!batchA || !batchB || loading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
              {loading ? "对比中..." : "对比"}
            </button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
          {compareData && <CompareView data={compareData} />}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-4">
            <select className="border rounded px-3 py-2" value={projectId} onChange={(e) => loadStages(e.target.value)} onFocus={loadProjects}>
              <option value="">选择项目</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="border rounded px-3 py-2" value={stageId} onChange={(e) => loadBatches(e.target.value)} disabled={!projectId}>
              <option value="">选择阶段</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="border rounded px-3 py-2 flex-1" placeholder="批跑 ID（逗号分隔）" value={batchIds} onChange={(e) => setBatchIds(e.target.value)} />
            <button onClick={handleMatrix} disabled={!projectId || !stageId || !batchIds || loading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
              {loading ? "查询中..." : "查询"}
            </button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
          {matrixData && <MatrixView data={matrixData} />}
        </div>
      )}
    </div>
  );
}