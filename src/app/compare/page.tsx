"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { EmptyState } from "@/components/shared/EmptyState";
import { Check } from "@phosphor-icons/react";
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
    `min-h-10 rounded-xl px-4 py-2 text-sm font-semibold transition ${
      active
        ? "bg-surface-solid text-accent shadow-sm ring-1 ring-border"
        : "text-text-secondary hover:bg-surface-solid/70 hover:text-text-primary"
    }`;

  const selectedProject = projects.find((project) => project.value === projectId)?.label;
  const selectedStage = stages.find((stage) => stage.value === stageId)?.label;

  return (
    <PageContainer title="跨批跑对比" subtitle="对比两个批跑之间的差异，或查看多个批跑的结果矩阵趋势">
      <div className="space-y-4">
        <div className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">选择分析方式</p>
            <p className="mt-1 text-xs text-text-secondary">
              差异对比聚焦两个批跑的变化，趋势矩阵适合连续版本观察。
            </p>
          </div>
          <div
            className="flex w-full rounded-2xl bg-bg/80 p-1 sm:w-auto"
            role="group"
            aria-label="对比方式"
          >
          <button
            type="button"
            aria-pressed={tab === "compare"}
            onClick={() => setTab("compare")}
            className={`${tabButtonClass(tab === "compare")} flex-1 sm:flex-none`}
          >
            差异对比
          </button>
          <button
            type="button"
            aria-pressed={tab === "matrix"}
            onClick={() => setTab("matrix")}
            className={`${tabButtonClass(tab === "matrix")} flex-1 sm:flex-none`}
          >
            趋势矩阵
          </button>
          </div>
        </div>

        {tab === "compare" ? (
          <div className="space-y-4">
            <section className="grid gap-3 lg:grid-cols-12" aria-label="差异对比条件">
              <div className="panel min-w-0 p-4 lg:col-span-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">1</span>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">选择项目</p>
                    <p className="text-xs text-text-secondary">确定对比范围</p>
                  </div>
                </div>
                <Select
                  placeholder="选择项目"
                  options={projects}
                  value={projectId}
                  onChange={(event) => void loadStages(event.target.value)}
                  onFocus={() => void loadProjects()}
                  aria-label="项目"
                />
              </div>

              <div className={`panel min-w-0 p-4 lg:col-span-4 ${!projectId ? "opacity-60" : ""}`}>
                <div className="mb-4 flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${projectId ? "bg-accent text-white" : "bg-bg text-text-secondary"}`}>2</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">选择阶段</p>
                    <p className="truncate text-xs text-text-secondary">
                      {projectId ? `当前项目：${selectedProject ?? ""}` : "完成上一步后可选"}
                    </p>
                  </div>
                </div>
                <Select
                  placeholder={projectId ? "选择阶段" : "请先选择项目"}
                  options={stages}
                  value={stageId}
                  onChange={(event) => void loadBatches(event.target.value)}
                  disabled={!projectId}
                  aria-label="阶段"
                />
              </div>

              <div className={`panel min-w-0 p-4 lg:col-span-4 ${!stageId ? "opacity-60" : ""}`}>
                <div className="mb-4 flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${stageId ? "bg-accent text-white" : "bg-bg text-text-secondary"}`}>3</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">选择批跑</p>
                    <p className="truncate text-xs text-text-secondary">
                      {stageId ? `当前阶段：${selectedStage ?? ""}` : "完成上一步后可选"}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Select
                    label="基准批跑 A"
                    placeholder={stageId ? "选择批跑 A" : "请先选择阶段"}
                    options={batches}
                    value={batchA}
                    onChange={(event) => {
                      setBatchA(event.target.value);
                      setCompareData(null);
                    }}
                    disabled={!stageId}
                  />
                  <Select
                    label="对照批跑 B"
                    placeholder={stageId ? "选择批跑 B" : "请先选择阶段"}
                    options={batches}
                    value={batchB}
                    onChange={(event) => {
                      setBatchB(event.target.value);
                      setCompareData(null);
                    }}
                    disabled={!stageId}
                  />
                </div>
              </div>
            </section>

            {batchA && batchA === batchB && (
              <p className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
                批跑 A 和批跑 B 不能相同，请重新选择对照批跑。
              </p>
            )}

            <div className="panel overflow-hidden p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-text-primary">差异结果</h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    {batchA && batchB ? "条件已就绪，可以开始对比。" : "按顺序完成 3 步选择后开始分析。"}
                  </p>
                </div>
                <Button
                  onClick={() => void handleCompare()}
                  disabled={!batchA || !batchB || batchA === batchB || loading}
                  className="w-full rounded-xl sm:w-auto"
                  aria-label="对比"
                >
                  {loading ? "对比中..." : "开始对比"}
                </Button>
              </div>
              {compareData ? (
                <CompareView data={compareData} projectId={projectId} stageId={stageId} />
              ) : (
                <EmptyState
                  title={stageId ? "等待选择两个批跑" : "从选择项目开始"}
                  description="批跑 A 是基准版本，批跑 B 是需要检查的对照版本。"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="grid gap-3 lg:grid-cols-5" aria-label="趋势矩阵条件">
              <div className="panel min-w-0 p-4">
                <p className="mb-3 text-sm font-semibold text-text-primary">
                  <span className="mr-2 text-accent">01</span>项目
                </p>
                <Select
                  placeholder="选择项目"
                  options={projects}
                  value={projectId}
                  onChange={(event) => void loadStages(event.target.value)}
                  onFocus={() => void loadProjects()}
                  aria-label="项目"
                />
              </div>
              <div className={`panel min-w-0 p-4 ${!projectId ? "opacity-60" : ""}`}>
                <p className="mb-3 text-sm font-semibold text-text-primary">
                  <span className="mr-2 text-accent">02</span>阶段
                </p>
                <Select
                  placeholder={projectId ? "选择阶段" : "请先选择项目"}
                  options={stages}
                  value={stageId}
                  onChange={(event) => void loadBatches(event.target.value)}
                  disabled={!projectId}
                  aria-label="阶段"
                />
              </div>
              <div className={`panel min-w-0 p-4 lg:col-span-3 ${!stageId ? "opacity-60" : ""}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    <span className="mr-2 text-accent">03</span>选择至少 2 个批跑
                  </p>
                  <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                    已选 {batchIds.length}
                  </span>
                </div>
                <div className="flex min-h-10 flex-wrap gap-2" aria-label="批跑多选">
                  {!stageId ? (
                    <span className="text-sm text-text-secondary">请先选择阶段</span>
                  ) : batches.length === 0 ? (
                    <span className="text-sm text-text-secondary">该阶段暂无可对比批跑</span>
                  ) : (
                    batches.map((batch) => {
                      const selected = batchIds.includes(batch.value);
                      return (
                        <button
                          key={batch.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setBatchIds((current) =>
                              selected
                                ? current.filter((id) => id !== batch.value)
                                : [...current, batch.value]
                            );
                            setMatrixData(null);
                          }}
                          className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                            selected
                              ? "border-accent bg-accent text-white shadow-sm"
                              : "border-border bg-bg text-text-primary hover:border-accent/30"
                          }`}
                        >
                          {selected && <Check size={13} weight="bold" aria-hidden="true" className="mr-1 inline" />}
                          {batch.label}
                        </button>
                      );
                    })
                  )}
                </div>
                <label htmlFor="matrix-batches" className="sr-only">
                  批跑（至少选择 2 个）
                </label>
                <select
                  id="matrix-batches"
                  aria-label="批跑（至少选择 2 个）"
                  aria-describedby="matrix-batches-help"
                  className="sr-only"
                  multiple
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
                <p id="matrix-batches-help" className="mt-3 text-xs text-text-secondary">
                  点击标签选择，已选择 {batchIds.length} 个。
                </p>
              </div>
            </section>

            <div className="panel overflow-hidden p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-text-primary">趋势矩阵</h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    横向比较同一用例在多个批跑中的结果变化。
                  </p>
                </div>
                <Button
                  onClick={() => void handleMatrix()}
                  disabled={!projectId || !stageId || batchIds.length < 2 || loading}
                  className="w-full rounded-xl sm:w-auto"
                  aria-label="查询"
                >
                  {loading ? "查询中..." : "生成矩阵"}
                </Button>
              </div>
              {matrixData ? (
                <MatrixView data={matrixData} projectId={projectId} stageId={stageId} />
              ) : (
                <EmptyState
                  title={stageId ? "请选择至少两个批跑" : "从选择项目开始"}
                  description="选择越多批跑，越容易发现持续失败和版本回归。"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
