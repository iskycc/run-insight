'use client';

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import ImportTypeSwitch from '@/components/import/ImportTypeSwitch';
import FileDropZone from '@/components/import/FileDropZone';
import FieldMapping from '@/components/import/FieldMapping';
import MappingTemplates from '@/components/import/MappingTemplates';
import ValidationReport from '@/components/import/ValidationReport';
import { Button } from '@/components/shared/Button';
import { Check } from '@phosphor-icons/react';
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
    <section className="rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)] sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-secondary)]">{label}</div>
      <div className="mt-1.5 truncate text-sm font-semibold text-[var(--color-text-primary)]">{value}</div>
    </div>
  );
}

function ProgressPanel({ progress }: { progress: ImportProgress }) {
  const isActive = progress.status === 'active';
  const isDone = progress.status === 'success';

  return (
    <Panel title="当前进度">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">{progress.label}</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{progress.detail}</p>
          </div>
          <span className="text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)]">
            {Math.round(progress.value)}%
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-[#e8edf5]"
          role="progressbar"
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.value)}
        >
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
  const currentIndex = STEP_ITEMS.findIndex((item) => item.key === step);

  return (
    <nav
      className="rounded-[22px] border border-white/80 bg-white px-4 py-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] sm:px-6"
      aria-label="导入步骤"
    >
      <ol className="grid grid-cols-5 gap-1 sm:gap-3">
        {STEP_ITEMS.map((item, index) => {
          const active = item.key === step;
          const complete = isStepComplete(step, item.key);
          return (
            <li
              key={item.key}
              className="relative flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  active
                    ? 'bg-accent text-white shadow-[0_6px_18px_rgba(37,99,235,0.28)]'
                    : complete
                      ? 'bg-accent/10 text-accent'
                      : 'bg-[#eef2f8] text-text-secondary'
                }`}
              >
                {complete ? <Check size={15} weight="bold" aria-hidden="true" /> : index + 1}
              </span>
              <div
                className={`truncate text-[11px] font-semibold sm:text-xs ${
                  active ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                {item.label}
              </div>
              {index < STEP_ITEMS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-4 h-px sm:left-8 sm:right-[-12px] ${
                    index < currentIndex ? 'bg-accent/50' : 'bg-border'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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
        className="field-control mt-2 h-11 w-full px-3 text-sm"
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
          className="field-control h-10 min-w-0 flex-1 px-3 text-sm"
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
    if (
      rows.length === 0
      || !selectedProjectId
      || !selectedStageId
      || !selectedBatchScopeId
    ) return;

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
  }, [
    rows,
    mapping,
    importType,
    selectedProjectId,
    selectedStageId,
    selectedBatchScopeId,
  ]);

  const handlePreview = useCallback(async () => {
    if (
      !canImport
      || previewInFlightRef.current
      || preValidationErrors.length > 0
      || rows.length === 0
      || !selectedProjectId
      || !selectedStageId
      || !selectedBatchScopeId
    ) return;
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
    preValidationErrors.length,
    rows,
    selectedBatchScopeId,
    selectedProjectId,
    selectedStageId,
    validatedRows,
  ]);

  const handleImport = useCallback(async () => {
    if (
      !canImport
      || !preview
      || importInFlightRef.current
      || !selectedProjectId
      || !selectedStageId
      || !selectedBatchScopeId
    ) return;
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
      <div className="flex items-center justify-center p-8">
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
  const targetReady = Boolean(selectedProjectId && selectedStageId && selectedBatchScopeId);
  const mappedFieldCount = Object.values(mapping).filter(Boolean).length;
  const nextAction = {
    'select-type': '确认导入类型后上传文件',
    upload: '选择一个数据文件',
    mapping: targetReady ? '检查字段映射并校验' : '依次选择项目、阶段与批跑',
    validate: preview ? '确认差异并正式导入' : '生成差异预览',
    done: '导入已完成',
  }[step];

  return (
    <div className="page-shell">
      <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Import</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-text-primary sm:text-4xl">
              导入用例数据
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              分步完成文件解析、字段映射与差异确认，正式导入前不会修改现有数据。
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/80 bg-border shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:w-auto">
            <div className="bg-white px-4 py-3 sm:min-w-24"><Metric label="行数上限" value="100,000" /></div>
            <div className="bg-white px-4 py-3 sm:min-w-24">
            <Metric label="字段数" value={headers.length || '—'} />
            </div>
            <div className="bg-white px-4 py-3 sm:min-w-24">
            <Metric label="数据行" value={rows.length || '—'} />
            </div>
          </div>
        </header>

        <Stepper step={step} />

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
          <main className="space-y-5">
            {step === 'select-type' && (
              <Panel title="选择导入类型">
                <div className="space-y-5">
                  <ImportTypeSwitch value={importType} onChange={setImportType} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setImportType('pre-analysis')}
                      className={`rounded-2xl border p-5 text-left transition-all ${
                        importType === 'pre-analysis'
                          ? 'border-accent/30 bg-accent/5 shadow-[0_10px_24px_rgba(37,99,235,0.10)]'
                          : 'border-border bg-[#f8faff] hover:border-accent/20 hover:bg-white'
                      }`}
                    >
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">分析前数据</span>
                      <span className="mt-2 block text-xs leading-5 text-[var(--color-text-secondary)]">导入用例编号、名称、结果概要与日志链接</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportType('post-analysis')}
                      className={`rounded-2xl border p-5 text-left transition-all ${
                        importType === 'post-analysis'
                          ? 'border-accent/30 bg-accent/5 shadow-[0_10px_24px_rgba(37,99,235,0.10)]'
                          : 'border-border bg-[#f8faff] hover:border-accent/20 hover:bg-white'
                      }`}
                    >
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">分析后数据</span>
                      <span className="mt-2 block text-xs leading-5 text-[var(--color-text-secondary)]">补充进展分类、责任人、根因与 MR / 单号</span>
                    </button>
                  </div>
                  <div className="flex justify-end border-t border-border pt-5">
                    <Button className="min-w-28" onClick={() => setStep('upload')}>下一步</Button>
                  </div>
                </div>
              </Panel>
            )}

            {step === 'upload' && (
              <Panel title="上传文件">
                <div className="space-y-4">
                  <FileDropZone onFileAccepted={handleFileAccepted} />
                  {fileError && (
                    <p role="alert" className="rounded-xl bg-danger/5 px-4 py-3 text-sm text-[var(--color-danger)]">
                      {fileError}
                    </p>
                  )}
                  {fileName && (
                    <div className="rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-text-primary">
                      已选择：<span className="font-semibold">{fileName}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-5">
                    <Button variant="secondary" onClick={() => setStep('select-type')}>上一步</Button>
                  </div>
                </div>
              </Panel>
            )}

            {step === 'mapping' && (
              <>
                <Panel title="导入目标">
                  <p className="-mt-2 mb-5 text-sm leading-6 text-text-secondary">
                    先确定数据将写入的范围，下一级选项会在上一级选择后开放。
                  </p>
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

                <div className="flex flex-wrap justify-between gap-3 rounded-2xl border border-white/80 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
                  <Button variant="secondary" onClick={() => setStep('upload')}>上一步</Button>
                  <Button
                    onClick={handlePreValidate}
                    disabled={!targetReady || rows.length === 0}
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
                <div className="flex flex-wrap justify-between gap-3 rounded-2xl border border-white/80 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
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
                    <Button
                      onClick={handlePreview}
                      disabled={isPreviewing || !targetReady || rows.length === 0}
                    >
                      {isPreviewing ? '预览中' : '预览导入差异'}
                    </Button>
                  )}
                  {preValidationErrors.length === 0 && errors.length === 0 && preview && (
                    <Button onClick={handleImport} disabled={isImporting || !targetReady}>
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

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
            <ProgressPanel progress={progress} />
            <Panel title="导入摘要">
              <div className="space-y-5">
                <div className="rounded-2xl bg-[#f4f7fc] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">下一步</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-text-primary">{nextAction}</p>
                </div>
                <div className="space-y-4">
                  <Metric label="文件" value={fileName || '尚未选择'} />
                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                    <Metric label="数据行" value={rows.length ? rows.length.toLocaleString('zh-CN') : '—'} />
                    <Metric label="已映射字段" value={mappedFieldCount || '—'} />
                  </div>
                </div>
                <div className="space-y-4 border-t border-border pt-4">
                  <Metric label="项目" value={selectedProject?.name ?? '未选择'} />
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="阶段" value={selectedStage?.name ?? '—'} />
                    <Metric label="批跑" value={selectedBatch?.name ?? '—'} />
                  </div>
                </div>
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}
