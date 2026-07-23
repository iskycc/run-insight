'use client';

import Papa from 'papaparse';
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import ImportTypeSwitch from '@/components/import/ImportTypeSwitch';
import FileDropZone from '@/components/import/FileDropZone';
import FieldMapping from '@/components/import/FieldMapping';
import ValidationReport from '@/components/import/ValidationReport';
import { Button } from '@/components/shared/Button';
import { fetchJson, ApiError } from '@/lib/fetch';
import type { ValidationError, ImportType } from '@/lib/validations';
import { validateImportDataClient } from '@/lib/validations';
import type { ImportResponse, ProjectDTO, TestStageDTO, BatchScopeDTO, ProjectsResponse, StagesResponse, BatchesResponse } from '@/types';

type Step = 'select-type' | 'upload' | 'mapping' | 'validate' | 'done';

export default function ImportPage() {
  const { user } = useAuth();

  // Step state
  const [step, setStep] = useState<Step>('select-type');

  // Import type
  const [importType, setImportType] = useState<ImportType>('pre-analysis');

  // File and parsed data
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Context selection
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; projectId: string; name: string }[]>([]);
  const [batches, setBatches] = useState<{ id: string; projectId: string; testStageId: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedBatchScopeId, setSelectedBatchScopeId] = useState('');

  // Inline "create new" state for each dropdown
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectError, setProjectError] = useState('');
  const [creatingStage, setCreatingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [stageError, setStageError] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [batchError, setBatchError] = useState('');

  // Validation/import results
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [preValidationErrors, setPreValidationErrors] = useState<ValidationError[]>([]);
  const [imported, setImported] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  // Fetch projects on mount
  useEffect(() => {
    fetchJson<ProjectsResponse>('/api/projects')
      .then((data) => {
        setProjects(data.projects.map((p: ProjectDTO) => ({ id: p.id, name: p.name })));
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  // Handle file accepted
  const handleFileAccepted = useCallback(async (file: File) => {
    setFileName(file.name);
    const text = await file.text();

    if (file.name.endsWith('.csv')) {
      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      const csvHeaders = result.meta.fields || [];
      const csvRows = result.data as Record<string, unknown>[];

      setHeaders(csvHeaders);
      setRows(csvRows);

      // Auto-map: try to match headers to field names
      const autoMapping: Record<string, string> = {};
      const fields = ['caseNo', 'name', 'resultSummary', 'logUrl', 'progressCategory', 'assignee', 'rootCause', 'mrOrTicket'];
      fields.forEach((field) => {
        const match = csvHeaders.find((h) => h.toLowerCase() === field.toLowerCase());
        if (match) autoMapping[field] = match;
      });
      setMapping(autoMapping);
    } else if (file.name.endsWith('.json')) {
      try {
        const data = JSON.parse(text);
        const jsonRows = Array.isArray(data) ? data : data.rows || [];
        if (jsonRows.length > 0) {
          const jsonHeaders = Object.keys(jsonRows[0]);
          setHeaders(jsonHeaders);
          setRows(jsonRows);

          const autoMapping: Record<string, string> = {};
          const fields = ['caseNo', 'name', 'resultSummary', 'logUrl', 'progressCategory', 'assignee', 'rootCause', 'mrOrTicket'];
          fields.forEach((field) => {
            if (jsonHeaders.includes(field)) autoMapping[field] = field;
          });
          setMapping(autoMapping);
        }
      } catch {
        // Invalid JSON
      }
    }

    setPreValidationErrors([]);
    setStep('mapping');
  }, []);

  // Fetch stages when project changes
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
      setStages(data.stages.map((s: TestStageDTO) => ({ id: s.id, projectId: s.projectId, name: s.name })));
    } catch (error) {
      console.error(error);
    }
  }, []);

  // Fetch batches when stage changes
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
      setBatches(data.batches.map((b: BatchScopeDTO) => ({
        id: b.id,
        projectId: b.projectId,
        testStageId: b.testStageId,
        name: b.name,
      })));
    } catch (error) {
      console.error(error);
    }
  }, []);

  // Create new project
  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setProjectError('');
    try {
      const data = await fetchJson<{ project: ProjectDTO }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setProjects((prev) => [...prev, { id: data.project.id, name: data.project.name }]);
      setSelectedProjectId(data.project.id);
      setCreatingProject(false);
      setNewProjectName('');
      // Trigger cascading load for the new project
      handleProjectChange(data.project.id);
    } catch (error) {
      if (error instanceof ApiError) {
        setProjectError(error.message);
      } else {
        setProjectError('创建失败');
      }
    }
  }, [newProjectName, handleProjectChange]);

  // Create new stage
  const handleCreateStage = useCallback(async () => {
    const name = newStageName.trim();
    if (!name || !selectedProjectId) return;
    setStageError('');
    try {
      const data = await fetchJson<{ stage: TestStageDTO }>(`/api/projects/${selectedProjectId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setStages((prev) => [...prev, { id: data.stage.id, projectId: data.stage.projectId, name: data.stage.name }]);
      setSelectedStageId(data.stage.id);
      setCreatingStage(false);
      setNewStageName('');
      // Trigger cascading load for the new stage
      handleStageChange(data.stage.id);
    } catch (error) {
      if (error instanceof ApiError) {
        setStageError(error.message);
      } else {
        setStageError('创建失败');
      }
    }
  }, [newStageName, selectedProjectId, handleStageChange]);

  // Create new batch
  const handleCreateBatch = useCallback(async () => {
    const name = newBatchName.trim();
    if (!name || !selectedStageId) return;
    setBatchError('');
    try {
      const data = await fetchJson<{ batch: BatchScopeDTO }>(`/api/stages/${selectedStageId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setBatches((prev) => [...prev, {
        id: data.batch.id,
        projectId: data.batch.projectId,
        testStageId: data.batch.testStageId,
        name: data.batch.name,
      }]);
      setSelectedBatchScopeId(data.batch.id);
      setCreatingBatch(false);
      setNewBatchName('');
    } catch (error) {
      if (error instanceof ApiError) {
        setBatchError(error.message);
      } else {
        setBatchError('创建失败');
      }
    }
  }, [newBatchName, selectedStageId]);

  // Handle pre-validation before navigating to validate step
  const handlePreValidate = useCallback(() => {
    const result = validateImportDataClient(rows, mapping, importType);
    setPreValidationErrors(result.errors);
    setStep('validate');
  }, [rows, mapping, importType]);

  // Handle import
  const handleImport = useCallback(async () => {
    setIsImporting(true);

    // Map rows through field mapping
    const mappedRows = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      Object.entries(mapping).forEach(([field, header]) => {
        if (header) obj[field] = row[header];
      });
      return obj;
    });

    try {
      const data = await fetchJson<ImportResponse>('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: mappedRows,
          importType,
          projectId: selectedProjectId,
          testStageId: selectedStageId,
          batchScopeId: selectedBatchScopeId,
        }),
      });

      setErrors(data.errors);
      setImported(data.imported);
      setStep('done');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 400) {
          // Validation errors from server — try to extract errors array
          try {
            const errorData = JSON.parse(error.message);
            setErrors(Array.isArray(errorData) ? errorData : []);
          } catch {
            setErrors([{ row: 0, field: '', message: error.message }]);
          }
        } else {
          setErrors([{ row: 0, field: '', message: error.message }]);
        }
      } else {
        setErrors([{ row: 0, field: '', message: '网络错误' }]);
      }
      setStep('validate');
    } finally {
      setIsImporting(false);
    }
  }, [rows, mapping, importType, selectedProjectId, selectedStageId, selectedBatchScopeId]);

  if (!user) {
    return (
      <div className="flex items-center justify-center p-xl">
        <p className="text-sm text-[var(--color-text-secondary)]">请先登录以使用导入功能</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-xl">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">导入用例数据</h2>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        {['选择类型', '上传文件', '字段映射', '校验导入'].map((label, i) => {
          const stepKeys: Step[] = ['select-type', 'upload', 'mapping', 'validate'];
          const isActive = stepKeys[i] === step || (step === 'done' && i === 3);
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isActive
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)]'
                }`}
              >
                {i + 1}
              </span>
              <span className={isActive ? 'text-[var(--color-text-primary)]' : ''}>{label}</span>
              {i < 3 && <span className="text-[var(--color-text-secondary)]">→</span>}
            </div>
          );
        })}
      </div>

      {/* Step: Select import type */}
      {step === 'select-type' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">选择导入数据的类型：</p>
          <ImportTypeSwitch value={importType} onChange={setImportType} />
          <div className="text-xs text-[var(--color-text-secondary)]">
            {importType === 'pre-analysis'
              ? '分析前数据：包含用例编号、名称、结果概要等基本信息'
              : '分析后数据：额外包含进展分类、责任人、根因、MR/单号等分析结果'}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep('upload')}>下一步</Button>
          </div>
        </div>
      )}

      {/* Step: Upload file */}
      {step === 'upload' && (
        <div className="space-y-4">
          <FileDropZone onFileAccepted={handleFileAccepted} />
          {fileName && (
            <p className="text-sm text-[var(--color-text-primary)]">已选择：{fileName}</p>
          )}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep('select-type')}>上一步</Button>
          </div>
        </div>
      )}

      {/* Step: Field mapping */}
      {step === 'mapping' && (
        <div className="space-y-6">
          {/* Context selection */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-sm)]">
            <h3 className="mb-4 text-sm font-medium text-[var(--color-text-primary)]">导入目标</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Project select */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">项目 *</label>
                <select
                  value={creatingProject ? '__new__' : selectedProjectId}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setCreatingProject(true);
                      setProjectError('');
                      setNewProjectName('');
                    } else {
                      setCreatingProject(false);
                      setProjectError('');
                      handleProjectChange(e.target.value);
                    }
                  }}
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] px-3 text-sm"
                >
                  <option value="">选择项目</option>
                  <option value="__new__">➕ 新建</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {creatingProject && (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="输入项目名称"
                        className="h-8 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] px-2 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateProject();
                        }}
                      />
                      <Button size="sm" onClick={handleCreateProject} disabled={!newProjectName.trim()}>确认</Button>
                    </div>
                    {projectError && <p className="text-xs text-[var(--color-danger)]">{projectError}</p>}
                  </div>
                )}
              </div>

              {/* Stage select */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">测试阶段 *</label>
                <select
                  value={creatingStage ? '__new__' : selectedStageId}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setCreatingStage(true);
                      setStageError('');
                      setNewStageName('');
                    } else {
                      setCreatingStage(false);
                      setStageError('');
                      handleStageChange(e.target.value);
                    }
                  }}
                  disabled={!selectedProjectId}
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] px-3 text-sm disabled:opacity-40"
                >
                  <option value="">选择阶段</option>
                  {!selectedProjectId ? (
                    <option value="__new__" disabled>➕ 新建（请先选择项目）</option>
                  ) : (
                    <option value="__new__">➕ 新建</option>
                  )}
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {creatingStage && (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newStageName}
                        onChange={(e) => setNewStageName(e.target.value)}
                        placeholder="输入阶段名称"
                        className="h-8 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] px-2 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateStage();
                        }}
                      />
                      <Button size="sm" onClick={handleCreateStage} disabled={!newStageName.trim()}>确认</Button>
                    </div>
                    {stageError && <p className="text-xs text-[var(--color-danger)]">{stageError}</p>}
                  </div>
                )}
              </div>

              {/* Batch select */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">批跑范围 *</label>
                <select
                  value={creatingBatch ? '__new__' : selectedBatchScopeId}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setCreatingBatch(true);
                      setBatchError('');
                      setNewBatchName('');
                    } else {
                      setCreatingBatch(false);
                      setBatchError('');
                      setSelectedBatchScopeId(e.target.value);
                    }
                  }}
                  disabled={!selectedStageId}
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] px-3 text-sm disabled:opacity-40"
                >
                  <option value="">选择批跑</option>
                  {!selectedStageId ? (
                    <option value="__new__" disabled>➕ 新建（请先选择阶段）</option>
                  ) : (
                    <option value="__new__">➕ 新建</option>
                  )}
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {creatingBatch && (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newBatchName}
                        onChange={(e) => setNewBatchName(e.target.value)}
                        placeholder="输入批跑名称"
                        className="h-8 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] px-2 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateBatch();
                        }}
                      />
                      <Button size="sm" onClick={handleCreateBatch} disabled={!newBatchName.trim()}>确认</Button>
                    </div>
                    {batchError && <p className="text-xs text-[var(--color-danger)]">{batchError}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Field mapping */}
          {rows.length > 0 && (
            <FieldMapping
              headers={headers}
              mapping={mapping}
              onMappingChange={setMapping}
              sampleRow={rows[0]}
            />
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep('upload')}>上一步</Button>
            <Button
              onClick={handlePreValidate}
              disabled={!selectedProjectId || !selectedStageId || !selectedBatchScopeId}
            >
              下一步
            </Button>
          </div>
        </div>
      )}

      {/* Step: Validate & Import */}
      {step === 'validate' && (
        <div className="space-y-4">
          <ValidationReport errors={preValidationErrors} totalRows={rows.length} />
          {preValidationErrors.length === 0 && errors.length > 0 && (
            <ValidationReport errors={errors} totalRows={rows.length} />
          )}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => {
              setPreValidationErrors([]);
              setErrors([]);
              setStep('mapping');
            }}>上一步</Button>
            {preValidationErrors.length === 0 && errors.length === 0 && (
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? '导入中...' : '开始导入'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="space-y-4">
          <ValidationReport errors={errors} totalRows={rows.length} />
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-success)] bg-[var(--color-success)]/5 p-5 shadow-[var(--shadow-sm)]">
            <p className="text-sm font-medium text-[var(--color-success)]">
              成功导入 {imported} 条用例数据
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setStep('select-type');
                setFileName('');
                setHeaders([]);
                setRows([]);
                setMapping({});
                setErrors([]);
                setPreValidationErrors([]);
                setImported(0);
              }}
            >
              继续导入
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
