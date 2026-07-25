'use client';

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import ImportTypeSwitch from '@/components/import/ImportTypeSwitch';
import FileDropZone from '@/components/import/FileDropZone';
import FieldMapping from '@/components/import/FieldMapping';
import MappingTemplates from '@/components/import/MappingTemplates';
import ValidationReport from '@/components/import/ValidationReport';
import { Button } from '@/components/shared/Button';
import { fetchJson, ApiError } from '@/lib/fetch';
import { buildAutoMapping, parseImportFile } from '@/lib/import-file-parser';
import type { ValidationError, ImportType } from '@/lib/validations';
import { validateImportDataClient } from '@/lib/validations';
import type {
  ImportResponse,
  ImportPreviewResponse,
  ImportValidationErrorResponse,
  ProjectDTO,
  TestStageDTO,
  BatchScopeDTO,
  ProjectsResponse,
  StagesResponse,
  BatchesResponse,
} from '@/types';

type Step = 'select-type' | 'upload' | 'mapping' | 'validate' | 'done';
type ProgressStatus = 'idle' | 'active' | 'success' | 'error';

type ImportProgress = {
  value: number;
  label: string;
  detail: string;
  status: ProgressStatus;
  startedAt: number | null;
  finishedMs: number | null;
};

const EMPTY_PROGRESS: ImportProgress = {
  value: 0,
  label: '等待开始',
  detail: '选择导入类型后上传文件',
  status: 'idle',
  startedAt: null,
  finishedMs: null,
};

const STEP_ITEMS: Array<{ key: Step; label: string }> = [
  { key: 'select-type', label: '类型' },
  { key: 'upload', label: '文件' },
  { key: 'mapping', label: '映射' },
  { key: 'validate', label: '校验' },
  { key: 'done', label: '完成' },
];

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function isStepComplete(current: Step, target: Step) {
  return STEP_ITEMS.findIndex((item) => item.key === target) < STEP_ITEMS.findIndex((item) => item.key === current);
}

function mapRows(rows: Record<string, unknown>[], mapping: Record<string, string>) {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    Object.entries(mapping).forEach(([field, header]) => {
      if (header) obj[field] = row[header];
    });
    return obj;
  });
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-[var(--color-text-secondary)]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">{value}</div>
    </div>
  );
}

function ProgressPanel({ progress }: { progress: ImportProgress }) {
  const isActive = progress.status === 'active';
  const isDone = progress.status === 'success';

  return (
    <Panel title="导入进度">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">{progress.label}</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{progress.detail}</p>
          </div>
          <span className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            {Math.round(progress.value)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progress.status === 'error'
                ? 'bg-[var(--color-danger)]'
                : isDone
                  ? 'bg-[var(--color-success)]'
                  : 'bg-[var(--color-accent)]'
            }`}
            style={{ width: `${progress.value}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <Metric label="状态" value={isActive ? '处理中' : isDone ? '已完成' : progress.status === 'error' ? '失败' : '待开始'} />
          <Metric label="耗时" value={formatDuration(progress.finishedMs)} />
        </div>
      </div>
    </Panel>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <div className="panel px-4 py-3">
      <div className="grid grid-cols-5 gap-2">
        {STEP_ITEMS.map((item) => {
          const active = item.key === step;
          const complete = isStepComplete(step, item.key);
          return (
            <div key={item.key} className="min-w-0">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  active || complete ? 'bg-[var(--color-accent)]' : 'bg-border'
                }`}
              />
              <div
                className={`mt-2 truncate text-xs font-medium ${
                  active ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  disabled,
  children,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="field-control mt-2 h-10 w-full px-3 text-sm"
      >
        {children}
      </select>
    </label>
  );
}

function InlineCreate({
  value,
  placeholder,
  error,
  onChange,
  onConfirm,
}: {
  value: string;
  placeholder: string;
  error: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="field-control h-9 min-w-0 flex-1 px-3 text-sm"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') onConfirm();
          }}
        />
        <Button size="sm" onClick={onConfirm} disabled={!value.trim()}>
          确认
        </Button>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

export default function ImportPage() {
  const { user } = useAuth();
  const canCreateProject = user?.role === 'ADMIN' || user?.role === 'EDITOR';
  const [step, setStep] = useState<Step>('select-type');
  const [importType, setImportType] = useState<ImportType>('pre-analysis');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [validatedRows, setValidatedRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState('');
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [stages, setStages] = useState<{ id: string; projectId: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; projectId: string; testStageId: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedBatchScopeId, setSelectedBatchScopeId] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectError, setProjectError] = useState('');
  const [creatingStage, setCreatingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [stageError, setStageError] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [batchError, setBatchError] = useState('');
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [preValidationErrors, setPreValidationErrors] = useState<ValidationError[]>([]);
  const [imported, setImported] = useState(0);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>(EMPTY_PROGRESS);
  const previewInFlightRef = useRef(false);
  const importInFlightRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const canImport = canCreateProject || projects.some((project) => project.canEdit);

  useEffect(() => {
    if (!user) return;

    fetchJson<ProjectsResponse>('/api/projects')
      .then((data) => {
        setProjects(data.projects.filter((project) => project.canEdit));
      })
      .catch((error) => {
        console.error(error);
      });
  }, [user]);

  const updateProgress = useCallback((patch: Partial<ImportProgress>) => {
    setProgress((current) => ({ ...current, ...patch }));
  }, []);

  const resetWorkflow = useCallback(() => {
    requestIdRef.current = crypto.randomUUID();
    setStep('select-type');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setValidatedRows([]);
    setMapping({});
    setErrors([]);
    setPreValidationErrors([]);
    setImported(0);
    setPreview(null);
    setFileError('');
    setProgress(EMPTY_PROGRESS);
  }, []);

  const handleFileAccepted = useCallback(async (file: File) => {
    requestIdRef.current = crypto.randomUUID();
    const startedAt = performance.now();
    try {
      setFileError('');
      setFileName(file.name);
      setRows([]);
      setValidatedRows([]);
      setHeaders([]);
      setMapping({});
      setProgress({
        value: 8,
        label: '读取文件',
        detail: file.name,
        status: 'active',
        startedAt,
        finishedMs: null,
      });
      await waitForPaint();

      const parsed = await parseImportFile(file);
      const autoMapping = buildAutoMapping(parsed.headers);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMapping);
      setPreValidationErrors([]);
      setErrors([]);
      setPreview(null);
      setProgress({
        value: 35,
        label: '文件已解析',
        detail: `${parsed.rows.length} 条数据，${parsed.headers.length} 个字段`,
        status: 'success',
        startedAt,
        finishedMs: performance.now() - startedAt,
      });
      setStep('mapping');
    } catch (error) {
      setFileName('');
      setHeaders([]);
      setRows([]);
      setValidatedRows([]);
      setMapping({});
      setFileError(error instanceof Error ? error.message : '文件解析失败');
      setProgress({
        value: 0,
        label: '解析失败',
        detail: error instanceof Error ? error.message : '文件解析失败',
        status: 'error',
        startedAt,
        finishedMs: performance.now() - startedAt,
      });
    }
  }, []);

  const handleProjectChange = useCallback(async (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedStageId('');
    setSelectedBatchScopeId('');
    setCreatingStage(false);
    setCreatingBatch(false);
    setStageError('');
    setBatchError('');
    if (!projectId) {
      setStages([]);
      setBatches([]);
      return;
    }
    try {
      const data = await fetchJson<StagesResponse>(`/api/projects/${projectId}/stages`);
      setStages(data.stages.map((stage: TestStageDTO) => ({ id: stage.id, projectId: stage.projectId, name: stage.name })));
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleStageChange = useCallback(async (stageId: string) => {
    setSelectedStageId(stageId);
    setSelectedBatchScopeId('');
    setCreatingBatch(false);
    setBatchError('');
    if (!stageId) {
      setBatches([]);
      return;
    }
    try {
      const data = await fetchJson<BatchesResponse>(`/api/stages/${stageId}/batches`);
      setBatches(data.batches.map((batch: BatchScopeDTO) => ({
        id: batch.id,
        projectId: batch.projectId,
        testStageId: batch.testStageId,
        name: batch.name,
      })));
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleCreateProject = useCallback(async () => {
    if (!canImport) return;
    const name = newProjectName.trim();
    if (!name) return;
    setProjectError('');
    try {
      const data = await fetchJson<{ project: ProjectDTO }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setProjects((current) => [...current, data.project]);
      setCreatingProject(false);
      setNewProjectName('');
      handleProjectChange(data.project.id);
    } catch (error) {
      setProjectError(error instanceof ApiError ? error.message : '创建失败');
    }
  }, [canImport, newProjectName, handleProjectChange]);

  const handleCreateStage = useCallback(async () => {
    if (!canImport) return;
    const name = newStageName.trim();
    if (!name || !selectedProjectId) return;
    setStageError('');
    try {
      const data = await fetchJson<{ stage: TestStageDTO }>(`/api/projects/${selectedProjectId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setStages((current) => [...current, { id: data.stage.id, projectId: data.stage.projectId, name: data.stage.name }]);
      setCreatingStage(false);
      setNewStageName('');
      handleStageChange(data.stage.id);
    } catch (error) {
      setStageError(error instanceof ApiError ? error.message : '创建失败');
    }
  }, [canImport, newStageName, selectedProjectId, handleStageChange]);

  const handleCreateBatch = useCallback(async () => {
    if (!canImport) return;
    const name = newBatchName.trim();
    if (!name || !selectedStageId) return;
    setBatchError('');
    try {
      const data = await fetchJson<{ batch: BatchScopeDTO }>(`/api/stages/${selectedStageId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setBatches((current) => [...current, {
        id: data.batch.id,
        projectId: data.batch.projectId,
        testStageId: data.batch.testStageId,
        name: data.batch.name,
      }]);
      setSelectedBatchScopeId(data.batch.id);
      setCreatingBatch(false);
      setNewBatchName('');
    } catch (error) {
      setBatchError(error instanceof ApiError ? error.message : '创建失败');
    }
  }, [canImport, newBatchName, selectedStageId]);

  const handlePreValidate = useCallback(async () => {
    const startedAt = performance.now();
    setErrors([]);
    setPreview(null);
    setProgress({
      value: 45,
      label: '校验数据',
      detail: `${rows.length} 条数据`,
      status: 'active',
      startedAt,
      finishedMs: null,
    });
    await waitForPaint();

    const result = validateImportDataClient(rows, mapping, importType);
    setValidatedRows(result.mappedRows);
    setPreValidationErrors(result.errors);
    setProgress({
      value: result.errors.length === 0 ? 60 : 45,
      label: result.errors.length === 0 ? '校验通过' : '校验未通过',
      detail: result.errors.length === 0 ? '可以开始导入' : `${result.errors.length} 个错误需要处理`,
      status: result.errors.length === 0 ? 'success' : 'error',
      startedAt,
      finishedMs: performance.now() - startedAt,
    });
    setStep('validate');
  }, [rows, mapping, importType]);

  const handlePreview = useCallback(async () => {
    if (!canImport || previewInFlightRef.current) return;
    previewInFlightRef.current = true;
    const startedAt = performance.now();
    setIsPreviewing(true);
    setErrors([]);
    setPreview(null);
    setProgress({
      value: 70,
      label: '生成差异预览',
      detail: `${rows.length} 条数据`,
      status: 'active',
      startedAt,
      finishedMs: null,
    });
    await waitForPaint();

    const rowsToImport = validatedRows.length === rows.length ? validatedRows : mapRows(rows, mapping);
    let hasRowErrors = false;
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rowsToImport,
          importType,
          projectId: selectedProjectId,
          testStageId: selectedStageId,
          batchScopeId: selectedBatchScopeId,
          fileName,
          preview: true,
        }),
      });
      const data = await response.json() as
        | ImportPreviewResponse
        | ImportResponse
        | ImportValidationErrorResponse
        | { error?: string; message?: string };
      if (!response.ok) {
        if ('details' in data && Array.isArray(data.details)) {
          hasRowErrors = true;
          setErrors(data.details);
          throw new ApiError(response.status, 'VALIDATION_ERROR', `${data.details.length} 个错误需要处理`);
        }
        throw new ApiError(
          response.status,
          'error' in data ? data.error ?? 'PREVIEW_FAILED' : 'PREVIEW_FAILED',
          'message' in data ? data.message ?? '预览失败' : '预览失败'
        );
      }
      if (!('preview' in data) || data.preview !== true) {
        throw new ApiError(response.status, 'PREVIEW_FAILED', '预览响应格式不正确');
      }
      setPreview(data);
      setProgress({
        value: 82,
        label: '差异预览已生成',
        detail: `新增 ${data.created}，更新 ${data.updated}，不变 ${data.unchanged}`,
        status: 'success',
        startedAt,
        finishedMs: performance.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '网络错误';
      if (!hasRowErrors) {
        setErrors([{ row: 0, field: '', message }]);
      }
      setProgress({
        value: 70,
        label: '预览失败',
        detail: message,
        status: 'error',
        startedAt,
        finishedMs: performance.now() - startedAt,
      });
    } finally {
      previewInFlightRef.current = false;
      setIsPreviewing(false);
    }
  }, [
    canImport,
    fileName,
    importType,
    mapping,
    rows,
    selectedBatchScopeId,
    selectedProjectId,
    selectedStageId,
    validatedRows,
  ]);

  const handleImport = useCallback(async () => {
    if (!canImport || !preview || importInFlightRef.current) return;
    importInFlightRef.current = true;
    const startedAt = performance.now();
    setIsImporting(true);
    setErrors([]);
    setProgress({
      value: 68,
      label: '准备导入',
      detail: `${rows.length} 条数据`,
      status: 'active',
      startedAt,
      finishedMs: null,
    });
    await waitForPaint();

    const rowsToImport = validatedRows.length === rows.length ? validatedRows : mapRows(rows, mapping);
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;

    try {
      updateProgress({
        value: 78,
        label: '写入数据库',
        detail: '批量提交中',
      });
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rowsToImport,
          importType,
          projectId: selectedProjectId,
          testStageId: selectedStageId,
          batchScopeId: selectedBatchScopeId,
          fileName,
          requestId,
        }),
      });
      const data = await response.json() as
        | ImportResponse
        | ImportValidationErrorResponse
        | { error?: string; message?: string };
      if (!response.ok) {
        if ('details' in data && Array.isArray(data.details)) {
          setErrors(data.details);
          setProgress({
            value: 78,
            label: '导入失败',
            detail: `${data.details.length} 个错误需要处理`,
            status: 'error',
            startedAt,
            finishedMs: performance.now() - startedAt,
          });
          setStep('validate');
          return;
        }
        const errorCode = 'error' in data ? data.error : undefined;
        const errorMessage = 'message' in data ? data.message : undefined;
        throw new ApiError(response.status, errorCode ?? 'IMPORT_FAILED', errorMessage ?? '导入失败');
      }

      if (!('imported' in data)) {
        throw new ApiError(response.status, 'IMPORT_FAILED', '导入失败');
      }
      setErrors(data.errors);
      setImported(data.imported);
      setProgress({
        value: 100,
        label: '导入完成',
        detail: `成功导入 ${data.imported} 条`,
        status: 'success',
        startedAt,
        finishedMs: performance.now() - startedAt,
      });
      setStep('done');
      requestIdRef.current = crypto.randomUUID();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '网络错误';
      setErrors([{ row: 0, field: '', message }]);
      setProgress({
        value: 78,
        label: '导入失败',
        detail: message,
        status: 'error',
        startedAt,
        finishedMs: performance.now() - startedAt,
      });
      setStep('validate');
    } finally {
      importInFlightRef.current = false;
      setIsImporting(false);
    }
  }, [
    rows,
    fileName,
    mapping,
    validatedRows,
    importType,
    selectedProjectId,
    selectedStageId,
    selectedBatchScopeId,
    updateProgress,
    canImport,
    preview,
  ]);

  if (!user) {
    return (
      <div className="flex items-center justify-center p-xl">
        <p className="text-sm text-[var(--color-text-secondary)]">请先登录以使用导入功能</p>
      </div>
    );
  }

  if (!canImport) {
    return (
      <div className="page-shell">
        <div className="mx-auto max-w-6xl">
          <section className="panel flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <h1 className="text-lg font-semibold text-text-primary">导入功能不可用</h1>
            <p className="text-sm text-text-secondary">
              当前账号为只读角色，如需导入用例数据，请联系管理员调整权限。
            </p>
          </section>
        </div>
      </div>
    );
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedStage = stages.find((stage) => stage.id === selectedStageId);
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchScopeId);

  return (
    <div className="page-shell">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Import</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              导入用例数据
            </h1>
          </div>
          <div className="panel grid grid-cols-3 gap-4 px-4 py-3">
            <Metric label="行数上限" value="100000" />
            <Metric label="字段数" value={headers.length || '—'} />
            <Metric label="数据行" value={rows.length || '—'} />
          </div>
        </header>

        <Stepper step={step} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="space-y-5">
            {step === 'select-type' && (
              <Panel title="选择导入类型">
                <div className="space-y-5">
                  <ImportTypeSwitch value={importType} onChange={setImportType} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={`rounded-md border p-4 ${importType === 'pre-analysis' ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5' : 'border-border bg-bg/60'}`}>
                      <div className="text-sm font-medium text-[var(--color-text-primary)]">分析前</div>
                      <div className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">用例编号、名称、结果概要、日志链接</div>
                    </div>
                    <div className={`rounded-md border p-4 ${importType === 'post-analysis' ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5' : 'border-border bg-bg/60'}`}>
                      <div className="text-sm font-medium text-[var(--color-text-primary)]">分析后</div>
                      <div className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">进展分类、责任人、根因、MR/单号</div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => setStep('upload')}>下一步</Button>
                  </div>
                </div>
              </Panel>
            )}

            {step === 'upload' && (
              <Panel title="上传文件">
                <div className="space-y-4">
                  <FileDropZone onFileAccepted={handleFileAccepted} />
                  {fileError && <p className="text-sm text-[var(--color-danger)]">{fileError}</p>}
                  {fileName && (
                    <div className="panel-muted px-4 py-3 text-sm text-text-primary">
                      已选择：{fileName}
                    </div>
                  )}
                  <div className="flex justify-between">
                    <Button variant="secondary" onClick={() => setStep('select-type')}>上一步</Button>
                  </div>
                </div>
              </Panel>
            )}

            {step === 'mapping' && (
              <>
                <Panel title="导入目标">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <SelectField
                        label="项目"
                        value={creatingProject ? '__new__' : selectedProjectId}
                        onChange={(value) => {
                          if (value === '__new__') {
                            setCreatingProject(true);
                            setProjectError('');
                            setNewProjectName('');
                          } else {
                            setCreatingProject(false);
                            setProjectError('');
                            handleProjectChange(value);
                          }
                        }}
                      >
                        <option value="">选择项目</option>
                        <option value="__new__">新建项目</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </SelectField>
                      {creatingProject && (
                        <InlineCreate
                          value={newProjectName}
                          placeholder="项目名称"
                          error={projectError}
                          onChange={setNewProjectName}
                          onConfirm={handleCreateProject}
                        />
                      )}
                    </div>

                    <div>
                      <SelectField
                        label="测试阶段"
                        value={creatingStage ? '__new__' : selectedStageId}
                        disabled={!selectedProjectId}
                        onChange={(value) => {
                          if (value === '__new__') {
                            setCreatingStage(true);
                            setStageError('');
                            setNewStageName('');
                          } else {
                            setCreatingStage(false);
                            setStageError('');
                            handleStageChange(value);
                          }
                        }}
                      >
                        <option value="">选择阶段</option>
                        <option value="__new__" disabled={!selectedProjectId}>新建阶段</option>
                        {stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>{stage.name}</option>
                        ))}
                      </SelectField>
                      {creatingStage && (
                        <InlineCreate
                          value={newStageName}
                          placeholder="阶段名称"
                          error={stageError}
                          onChange={setNewStageName}
                          onConfirm={handleCreateStage}
                        />
                      )}
                    </div>

                    <div>
                      <SelectField
                        label="批跑范围"
                        value={creatingBatch ? '__new__' : selectedBatchScopeId}
                        disabled={!selectedStageId}
                        onChange={(value) => {
                          if (value === '__new__') {
                            setCreatingBatch(true);
                            setBatchError('');
                            setNewBatchName('');
                          } else {
                            setCreatingBatch(false);
                            setBatchError('');
                            setSelectedBatchScopeId(value);
                          }
                        }}
                      >
                        <option value="">选择批跑</option>
                        <option value="__new__" disabled={!selectedStageId}>新建批跑</option>
                        {batches.map((batch) => (
                          <option key={batch.id} value={batch.id}>{batch.name}</option>
                        ))}
                      </SelectField>
                      {creatingBatch && (
                        <InlineCreate
                          value={newBatchName}
                          placeholder="批跑名称"
                          error={batchError}
                          onChange={setNewBatchName}
                          onConfirm={handleCreateBatch}
                        />
                      )}
                    </div>
                  </div>
                </Panel>

                {rows.length > 0 && (
                  <Panel title="字段映射">
                    <MappingTemplates
                      key={importType}
                      importType={importType}
                      headers={headers}
                      mapping={mapping}
                      onApply={setMapping}
                    />
                    <FieldMapping
                      headers={headers}
                      mapping={mapping}
                      onMappingChange={setMapping}
                      sampleRow={rows[0]}
                    />
                  </Panel>
                )}

                <div className="flex justify-between">
                  <Button variant="secondary" onClick={() => setStep('upload')}>上一步</Button>
                  <Button
                    onClick={handlePreValidate}
                    disabled={!selectedProjectId || !selectedStageId || !selectedBatchScopeId}
                  >
                    校验数据
                  </Button>
                </div>
              </>
            )}

            {step === 'validate' && (
              <div className="space-y-5">
                <ValidationReport errors={preValidationErrors.length > 0 ? preValidationErrors : errors} totalRows={rows.length} />
                {preview && (
                  <Panel title="导入差异预览">
                    <div className="grid gap-4 sm:grid-cols-4">
                      <Metric label="总行数" value={preview.total} />
                      <Metric label="将新增" value={preview.created} />
                      <Metric label="将更新" value={preview.updated} />
                      <Metric label="无变化" value={preview.unchanged} />
                    </div>
                    <div className="mt-5 grid gap-4 border-t border-border pt-4 md:grid-cols-3">
                      {([
                        ['新增样例', preview.samples.created],
                        ['更新样例', preview.samples.updated],
                        ['无变化样例', preview.samples.unchanged],
                      ] as const).map(([label, samples]) => (
                        <div key={label}>
                          <p className="text-xs font-medium text-[var(--color-text-secondary)]">{label}</p>
                          <ul className="mt-2 space-y-1 text-xs text-[var(--color-text-primary)]">
                            {samples.length === 0 && <li>—</li>}
                            {samples.map((sample) => (
                              <li key={sample.caseNo} className="truncate" title={`${sample.caseNo} · ${sample.name}`}>
                                {sample.caseNo} · {sample.name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
                      预览不会写入数据库。确认后才会执行正式导入。
                    </p>
                  </Panel>
                )}
                <div className="flex justify-between">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPreValidationErrors([]);
                      setErrors([]);
                      setPreview(null);
                      setStep('mapping');
                    }}
                    disabled={isImporting || isPreviewing}
                  >
                    上一步
                  </Button>
                  {preValidationErrors.length === 0 && errors.length === 0 && !preview && (
                    <Button onClick={handlePreview} disabled={isPreviewing}>
                      {isPreviewing ? '预览中' : '预览导入差异'}
                    </Button>
                  )}
                  {preValidationErrors.length === 0 && errors.length === 0 && preview && (
                    <Button onClick={handleImport} disabled={isImporting}>
                      {isImporting ? '导入中' : '确认并导入'}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="space-y-5">
                <ValidationReport errors={errors} totalRows={rows.length} />
                <Panel title="导入结果">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Metric label="成功导入" value={imported} />
                    <Metric label="总行数" value={rows.length} />
                    <Metric label="导入耗时" value={formatDuration(progress.finishedMs)} />
                  </div>
                </Panel>
                <div className="flex justify-end">
                  <Button onClick={resetWorkflow}>继续导入</Button>
                </div>
              </div>
            )}
          </main>

          <aside className="space-y-5">
            <ProgressPanel progress={progress} />
            <Panel title="文件摘要">
              <div className="space-y-4">
                <Metric label="文件" value={fileName || '—'} />
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <Metric label="字段" value={headers.length || '—'} />
                  <Metric label="数据行" value={rows.length || '—'} />
                </div>
              </div>
            </Panel>
            <Panel title="目标范围">
              <div className="space-y-4">
                <Metric label="项目" value={selectedProject?.name ?? '—'} />
                <Metric label="阶段" value={selectedStage?.name ?? '—'} />
                <Metric label="批跑" value={selectedBatch?.name ?? '—'} />
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}
