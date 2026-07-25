"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/contexts/ToastContext";
import CompareView from "@/components/compare/CompareView";
import MatrixView from "@/components/compare/MatrixView";
import type { CompareResponse, MatrixResponse } from "@/types";

type Tab = "compare" | "matrix";

interface SelectOption {
  value: string;
  label: string;
}

export default function ComparePage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("compare");
  const [projectId, setProjectId] = useState("");
  const [stageId, setStageId] = useState("");
  const [batchA, setBatchA] = useState("");
  const [batchB, setBatchB] = useState("");
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [matrixData, setMatrixData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<SelectOption[]>([]);
  const [stages, setStages] = useState<SelectOption[]>([]);
  const [batches, setBatches] = useState<SelectOption[]>([]);

  async function loadProjects() {
    if (projects.length > 0) return;
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("加载项目失败");
      const data = await res.json();
      const options: SelectOption[] = (data.projects || []).map((p: { id: string; name: string }) => ({
        value: p.id,
        label: p.name,
      }));
      setProjects(options);
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "加载项目失败" });
    }
  }

  async function loadStages(pid: string) {
    setProjectId(pid);
    setStageId("");
    setBatchA("");
    setBatchB("");
    setBatchIds([]);
    setCompareData(null);
    setMatrixData(null);
    setBatches([]);
    if (!pid) {
      setStages([]);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${pid}/stages`);
      if (!res.ok) throw new Error("加载阶段失败");
      const data = await res.json();
      const options: SelectOption[] = (data.stages || []).map((s: { id: string; name: string }) => ({
        value: s.id,
        label: s.name,
      }));
      setStages(options);
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "加载阶段失败" });
    }
  }

  async function loadBatches(sid: string) {
    setStageId(sid);
    setBatchA("");
    setBatchB("");
    setBatchIds([]);
    setCompareData(null);
    setMatrixData(null);
    if (!sid) {
      setBatches([]);
      return;
    }
    try {
      const res = await fetch(`/api/stages/${sid}/batches`);
      if (!res.ok) throw new Error("加载批跑失败");
      const data = await res.json();
      const options: SelectOption[] = (data.batches || []).map((b: { id: string; name: string }) => ({
        value: b.id,
        label: b.name,
      }));
      setBatches(options);
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "加载批跑失败" });
    }
  }

  async function handleCompare() {
    if (!batchA || !batchB || batchA === batchB) return;
    setLoading(true);
    setCompareData(null);
    try {
      const res = await fetch(`/api/stats/compare?batchA=${batchA}&batchB=${batchB}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "对比失败");
      }
      setCompareData(await res.json());
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "对比失败" });
    } finally {
      setLoading(false);
    }
  }

  async function handleMatrix() {
    if (!projectId || !stageId || batchIds.length < 2) return;
    setLoading(true);
    setMatrixData(null);
    try {
      const params = new URLSearchParams({
        projectId,
        stageId,
        batchIds: batchIds.join(","),
      });
      const res = await fetch(`/api/stats/matrix?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "矩阵查询失败");
      }
      setMatrixData(await res.json());
    } catch (err) {
      showToast({ type: "error", message: err instanceof Error ? err.message : "矩阵查询失败" });
    } finally {
      setLoading(false);
    }
  }

  const tabButtonClass = (active: boolean) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      active
        ? "bg-accent text-white shadow-sm"
        : "bg-bg text-text-primary hover:bg-surface-solid border border-border"
    }`;

  const emptyBatchOptions: SelectOption[] = [{ value: "", label: "选择批跑 A" }];

  return (
    <PageContainer title="跨批跑对比" subtitle="对比两个批跑之间的差异，或查看多个批跑的结果矩阵趋势">
      <div className="card p-md">
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setTab("compare")} className={tabButtonClass(tab === "compare")}>
            差异对比
          </button>
          <button onClick={() => setTab("matrix")} className={tabButtonClass(tab === "matrix")}>
            趋势矩阵
          </button>
        </div>

        {tab === "compare" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[160px] flex-1 sm:flex-none">
                <Select
                  label="项目"
                  placeholder="选择项目"
                  options={projects}
                  value={projectId}
                  onChange={(e) => loadStages(e.target.value)}
                  onFocus={loadProjects}
                />
              </div>
              <div className="min-w-[160px] flex-1 sm:flex-none">
                <Select
                  label="阶段"
                  placeholder="选择阶段"
                  options={stages}
                  value={stageId}
                  onChange={(e) => loadBatches(e.target.value)}
                  disabled={!projectId}
                />
              </div>
              <div className="min-w-[160px] flex-1 sm:flex-none">
                <Select
                  label="批跑 A"
                  placeholder="选择批跑 A"
                  options={batches.length > 0 ? batches : emptyBatchOptions}
                  value={batchA}
                  onChange={(e) => {
                    setBatchA(e.target.value);
                    setCompareData(null);
                  }}
                  disabled={!stageId}
                />
              </div>
              <div className="min-w-[160px] flex-1 sm:flex-none">
                <Select
                  label="批跑 B"
                  placeholder="选择批跑 B"
                  options={batches.length > 0 ? batches : emptyBatchOptions}
                  value={batchB}
                  onChange={(e) => {
                    setBatchB(e.target.value);
                    setCompareData(null);
                  }}
                  disabled={!stageId}
                />
              </div>
              <Button
                onClick={handleCompare}
                disabled={!batchA || !batchB || batchA === batchB || loading}
                className="w-full sm:w-auto"
              >
                {loading ? "对比中..." : "对比"}
              </Button>
            </div>
            {batchA && batchA === batchB && (
              <p className="text-sm text-danger" role="alert">批跑 A 和批跑 B 不能相同。</p>
            )}

            {compareData ? (
              <CompareView data={compareData} projectId={projectId} stageId={stageId} />
            ) : (
              <EmptyState
                title="请选择批跑进行对比"
                description="选择项目、阶段及两个批跑后，点击对比按钮查看差异。"
              />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[160px] flex-1 sm:flex-none">
                <Select
                  label="项目"
                  placeholder="选择项目"
                  options={projects}
                  value={projectId}
                  onChange={(e) => loadStages(e.target.value)}
                  onFocus={loadProjects}
                />
              </div>
              <div className="min-w-[160px] flex-1 sm:flex-none">
                <Select
                  label="阶段"
                  placeholder="选择阶段"
                  options={stages}
                  value={stageId}
                  onChange={(e) => loadBatches(e.target.value)}
                  disabled={!projectId}
                />
              </div>
              <div className="min-w-[240px] flex-[2] sm:flex-none">
                <label
                  htmlFor="matrix-batches"
                  className="mb-1.5 block text-xs font-semibold text-text-secondary"
                >
                  批跑（至少选择 2 个）
                </label>
                <select
                  id="matrix-batches"
                  aria-describedby="matrix-batches-help"
                  multiple
                  size={Math.min(Math.max(batches.length, 2), 6)}
                  className="field-control min-h-20 w-full px-3 py-2 text-sm"
                  disabled={!stageId}
                  value={batchIds}
                  onChange={(event) => {
                    setBatchIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value));
                    setMatrixData(null);
                  }}
                >
                  {batches.map((batch) => (
                    <option key={batch.value} value={batch.value}>{batch.label}</option>
                  ))}
                </select>
                <p id="matrix-batches-help" className="mt-1 text-xs text-text-secondary">
                  按住 Ctrl/Command 可选择多个批跑，已选择 {batchIds.length} 个。
                </p>
              </div>
              <Button
                onClick={handleMatrix}
                disabled={!projectId || !stageId || batchIds.length < 2 || loading}
                className="w-full sm:w-auto"
              >
                {loading ? "查询中..." : "查询"}
              </Button>
            </div>

            {matrixData ? (
              <MatrixView data={matrixData} projectId={projectId} stageId={stageId} />
            ) : (
              <EmptyState
                title="请选择批跑查看矩阵"
                description="选择项目、阶段及至少两个批跑后，点击查询按钮查看趋势矩阵。"
              />
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
