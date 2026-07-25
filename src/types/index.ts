// ============ 进展分类枚举 ============

export const PROGRESS_CATEGORIES = [
  "PENDING",
  "ANALYZING",
  "LOCATED",
  "FIXED",
  "NOT_ISSUE",
  "BLOCKED",
] as const;

export type ProgressCategory = (typeof PROGRESS_CATEGORIES)[number];

export const PROGRESS_LABELS: Record<ProgressCategory, string> = {
  PENDING: "待分析",
  ANALYZING: "分析中",
  LOCATED: "已定位",
  FIXED: "已修复",
  NOT_ISSUE: "非问题",
  BLOCKED: "阻塞",
};

// ============ 用例结果汇总枚举 ============

export const RESULT_SUMMARIES = ["PASS", "FAIL", "BLOCK", "SKIP"] as const;

export type ResultSummary = (typeof RESULT_SUMMARIES)[number];
export type ProjectRole = "ADMIN" | "EDITOR" | "VIEWER";
export type CasePriority = "HIGH" | "MEDIUM" | "LOW";
export type AssetStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

// ============ 数据模型类型（与 Prisma 生成的类型对齐） ============

export interface UserDTO {
  id: string;
  username: string;
  role?: Role;
  createdAt: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  projectRole: ProjectRole | null;
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
}

export interface TestStageDTO {
  id: string;
  projectId: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BatchScopeDTO {
  id: string;
  projectId: string;
  testStageId: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaseResultDTO {
  id: string;
  caseNo: string;
  name: string;
  resultSummary: string;
  logUrl: string | null;
  projectId: string;
  testStageId: string;
  batchScopeId: string;
  assignee: string | null;
  assigneeId?: string | null;
  assigneeUsername?: string | null;
  priority?: CasePriority | null;
  dueDate?: string | null;
  progressCategory: string | null;
  rootCause: string | null;
  rootCauseCategoryId?: string | null;
  rootCauseCategory?: { id: string; name: string } | null;
  mrOrTicket: string | null;
  notes: string | null;
  assetSaved: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============ 包含关联数据的复合类型 ============

export interface ProjectWithStats extends ProjectDTO {
  stageCount: number;
  caseCount: number;
  passCount: number;
  failCount: number;
}

export interface TestStageWithStats extends TestStageDTO {
  batchCount: number;
  caseCount: number;
  passCount: number;
  failCount: number;
}

export interface BatchScopeWithStats extends BatchScopeDTO {
  caseCount: number;
  passCount: number;
  failCount: number;
}

// ============ 大盘统计 ============

export interface DashboardStats {
  totalProjects: number;
  totalCases: number;
  passCount: number;
  failCount: number;
  blockCount: number;
  skipCount: number;
  passRate: number;
  progressDistribution: Record<ProgressCategory, number>;
}

// ============ API 请求/响应类型 ============

// --- 认证 ---
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: UserDTO;
}

export interface MeResponse {
  user: UserDTO | null;
}

// --- 项目 ---
export interface CreateProjectRequest {
  name: string;
}

export interface ProjectsResponse {
  projects: ProjectWithStats[];
}

// --- 阶段 ---
export interface CreateStageRequest {
  name: string;
}

export interface StagesResponse {
  stages: TestStageWithStats[];
}

// --- 批跑 ---
export interface CreateBatchRequest {
  name: string;
}

export interface BatchesResponse {
  batches: BatchScopeWithStats[];
}

// --- 用例 ---
export interface UpdateCaseRequest {
  assignee?: string;
  assigneeId?: string | null;
  priority?: CasePriority | null;
  dueDate?: string | null;
  progressCategory?: ProgressCategory;
  rootCause?: string;
  rootCauseCategoryId?: string | null;
  mrOrTicket?: string;
  notes?: string;
  assetSaved?: boolean;
}

export interface ProjectMemberDTO {
  id: string;
  projectId: string;
  userId: string;
  username: string;
  systemRole: Role;
  role: ProjectRole;
  createdAt: string;
}

export interface ProjectMembersResponse {
  members: ProjectMemberDTO[];
  canManage: boolean;
}

export interface CaseActivityDTO {
  id: string;
  type: "CREATED" | "UPDATED" | "COMMENT";
  changes: Record<string, { from: unknown; to: unknown }> | null;
  comment: string | null;
  user: { id: string; username: string };
  createdAt: string;
}

export interface CasesQueryParams {
  projectId?: string;
  testStageId?: string;
  batchScopeId?: string;
  progressCategory?: ProgressCategory;
  assetSaved?: string;
  search?: string;
  resultSummary?: ResultSummary;
  assignee?: string;
  rootCause?: string;
  dateFrom?: string;
  dateTo?: string;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  page?: string;
  pageSize?: string;
}

export interface CasesResponse {
  cases: CaseResultDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CaseDetailResponse {
  case: CaseResultDTO & {
    updatedByUsername: string | null;
  };
}

export interface BatchUpdateCaseRequest {
  caseIds: string[];
  updates: UpdateCaseRequest;
}

export interface BatchUpdateResponse {
  updated: number;
}

export interface SaveAssetResponse {
  case: CaseResultDTO;
  asset: AssetDTO;
}

export interface BatchSaveAssetRequest {
  caseIds: string[];
}

export interface BatchSaveAssetResponse {
  updated: number;
}

export interface RootCauseCategoryDTO {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
}

export interface RootCauseCategoriesResponse {
  categories: RootCauseCategoryDTO[];
  canManage: boolean;
}

export interface AssetDTO {
  id: string;
  sourceCaseId: string | null;
  projectId: string;
  rootCauseCategoryId: string | null;
  title: string;
  summary: string;
  solution: string;
  rootCauseText: string | null;
  tags: string[];
  status: AssetStatus;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  viewCount: number;
  reuseCount: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  project: { id: string; name: string };
  rootCauseCategory: { id: string; name: string } | null;
  sourceCase: {
    id: string;
    caseNo: string;
    name: string;
    resultSummary: string;
  } | null;
  creator?: { username: string } | null;
  updater?: { username: string } | null;
}

export interface AssetsResponse {
  assets: AssetDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateAssetRequest {
  title?: string;
  summary?: string;
  solution?: string;
  rootCauseCategoryId?: string | null;
  rootCauseText?: string | null;
  tags?: string[];
  status?: AssetStatus;
}

// --- 大盘统计 ---
export interface DashboardStatsResponse {
  projectCount: number;
  testStageCount: number;
  batchScopeCount: number;
  totalCaseCount: number;
  passedCaseCount: number;
  failedCaseCount: number;
  blockedCaseCount: number;
  skippedCaseCount: number;
  passRate: number;
  failRate: number;
  analyzedCaseCount: number;
  assetCount: number;
  progressDistribution: { category: string; count: number }[];
}

export interface TrendDataPoint {
  batch: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passRate: number;
  failRate: number;
  analyzed: number;
}

export interface TrendResponse {
  trends: TrendDataPoint[];
}

// --- 导入 ---
export type ImportType = "pre-analysis" | "post-analysis";

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResponse {
  imported: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: ValidationError[];
}

export interface ImportValidationErrorResponse extends ApiError {
  details: ValidationError[];
}

export interface ImportPreviewSample {
  caseNo: string;
  name: string;
}

export interface ImportPreviewResponse {
  preview: true;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  samples: {
    created: ImportPreviewSample[];
    updated: ImportPreviewSample[];
    unchanged: ImportPreviewSample[];
  };
  errors: ValidationError[];
}

// --- 通用 ---
export interface ApiError {
  error: string;
  message: string;
}

// ============ 对比与矩阵 ============

export interface DiffItem {
  caseNo: string;
  name: string;
  resultA: string;
  resultB: string;
}

export interface BatchDiff {
  unchanged: number;
  passToFail: DiffItem[];
  failToPass: DiffItem[];
  otherChanges: DiffItem[];
  newInB: DiffItem[];
  removedFromB: DiffItem[];
}

export interface CompareResponse {
  batchA: { id: string; name: string; caseCount: number };
  batchB: { id: string; name: string; caseCount: number };
  diff: BatchDiff;
}

export interface MatrixRow {
  caseNo: string;
  name: string;
  results: Record<string, string>;
}

export interface MatrixResponse {
  batches: { id: string; name: string }[];
  rows: MatrixRow[];
}

// ============ 导出 ============

export type ExportFormat = "csv" | "json";

// ============ 导入历史 ============

export interface ImportRecordDTO {
  id: string;
  projectId: string;
  projectName: string;
  importType: string;
  fileName: string;
  totalRows: number;
  importedCount: number;
  errorCount: number;
  userId: string;
  username: string;
  status: ImportRecordStatus;
  rolledBackAt: string | null;
  createdAt: string;
}

export type ImportRecordStatus = "success" | "partial" | "failed";

export interface ImportRecordDetail extends ImportRecordDTO {
  errors: ValidationError[] | null;
  rolledBackBy: string | null;
  canRollback: boolean;
}

export interface ImportHistoryResponse {
  records: ImportRecordDTO[];
  projects: { id: string; name: string }[];
  total: number;
  page: number;
  pageSize: number;
}

// ============ 角色 ============

export type Role = "ADMIN" | "EDITOR" | "VIEWER";

export interface UserWithRole extends UserDTO {
  role: Role;
  updatedAt: string;
}

// ============ 审计日志 ============

export interface AuditLogDTO {
  id: string;
  userId: string;
  username: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: unknown;
  createdAt: string;
}

export interface AuditLogsResponse {
  logs: AuditLogDTO[];
  total: number;
  page: number;
  pageSize: number;
}

// ============ 用户管理 ============

export interface CreateUserRequest {
  username: string;
  password: string;
  role: Role;
}

export interface UpdateUserRequest {
  role: Role;
}

export interface UsersResponse {
  users: UserWithRole[];
}

// ============ API Key ============

export interface ApiKeyResponse {
  id: string;
  description: string;
  createdAt: string;
}

export interface ApiKeyCreateResponse extends ApiKeyResponse {
  key: string;
}

export interface ApiKeysListResponse {
  keys: ApiKeyResponse[];
}

// ============ 责任人统计 ============

export interface AssigneeStat {
  assignee: string;
  totalCases: number;
  failCount: number;
  fixCount: number;
  savedAssetCount: number;
  fixRate: number;
}

export interface AssigneeStatsResponse {
  stats: AssigneeStat[];
}
