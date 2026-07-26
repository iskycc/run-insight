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
export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";
export type CasePriority = "HIGH" | "MEDIUM" | "LOW";
export type AssetStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
export type NotificationType =
  | "ASSIGNMENT"
  | "MENTION"
  | "WATCHED_COMMENT"
  | "WATCHED_UPDATE"
  | "DUE_SOON"
  | "OVERDUE";

// ============ 数据模型类型（与 Prisma 生成的类型对齐） ============

export interface UserDTO {
  id: string;
  username: string;
  role?: Role;
  createdAt: string;
}

export interface ProjectDTO {
  id: string;
  organizationId?: string;
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
  executedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  environment: string | null;
  buildVersion: string | null;
  commitSha: string | null;
  pipelineUrl: string | null;
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
  projectName?: string | null;
  testStageId: string;
  testStageName?: string | null;
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

export type SessionStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface SessionDTO {
  id: string;
  deviceInfo: string;
  status: SessionStatus;
  isCurrent: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
}

export interface SessionsResponse {
  sessions: SessionDTO[];
}

// --- 项目 ---
export interface CreateProjectRequest {
  name: string;
}

export interface ProjectsResponse {
  projects: ProjectWithStats[];
}

export interface OrganizationDTO {
  id: string;
  name: string;
  archived: boolean;
  role: OrganizationRole;
  createdAt: string;
}

export interface OrganizationsResponse {
  organizations: OrganizationDTO[];
  currentOrganizationId: string | null;
}

export interface OrganizationMemberDTO {
  id: string;
  organizationId: string;
  userId: string;
  username: string;
  role: OrganizationRole;
  createdAt: string;
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
  executedAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  environment?: string | null;
  buildVersion?: string | null;
  commitSha?: string | null;
  pipelineUrl?: string | null;
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
  canManage?: boolean;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType | "REPORT_GENERATED";
  readAt: string | null;
  createdAt: string;
  link: string;
  actor: { id: string; username: string } | null;
  project: { id: string; name: string };
  case: { id: string; caseNo: string; name: string };
}

export interface NotificationsResponse {
  notifications: NotificationDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NotificationPreferencesDTO {
  assignmentEnabled: boolean;
  mentionEnabled: boolean;
  watchedEnabled: boolean;
  dueSoonEnabled: boolean;
  overdueEnabled: boolean;
  dueSoonHours: number;
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

export type SavedViewScope = "PERSONAL" | "PROJECT";

export interface SavedViewFilters {
  projectId?: string;
  stageId?: string;
  batchScopeId?: string;
  progressCategory?: string;
  assetSaved?: string;
  search?: string;
  resultSummary?: string;
  assignee?: string;
  rootCause?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SavedViewDTO {
  id: string;
  ownerId: string;
  ownerName: string;
  projectId: string | null;
  name: string;
  filters: SavedViewFilters;
  scope: SavedViewScope;
  isDefault: boolean;
  isOwner: boolean;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewsResponse {
  views: SavedViewDTO[];
  canShare: boolean;
}

export interface SavedViewResponse {
  view: SavedViewDTO;
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
  canReview: boolean;
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

export interface AssetVersionDTO {
  id: string;
  assetId: string;
  version: number;
  title: string;
  summary: string;
  solution: string;
  rootCauseText: string | null;
  tags: string[];
  status: AssetStatus;
  changedBy: string | null;
  author: { username: string } | null;
  createdAt: string;
}

export interface AssetVersionsResponse {
  versions: AssetVersionDTO[];
  canRollback: boolean;
}

export interface AssetVersionDiffChange {
  field: "title" | "summary" | "solution" | "rootCauseText" | "tags" | "status";
  label: string;
  before: string | string[] | null;
  after: string | string[] | null;
}

export interface AssetVersionDetailResponse {
  version: AssetVersionDTO;
  compareTo: AssetVersionDTO | null;
  changes: AssetVersionDiffChange[];
  canRollback: boolean;
}

export interface CreateAssetRequest {
  projectId: string;
  title: string;
  summary: string;
  solution: string;
  rootCauseCategoryId?: string | null;
  rootCauseText?: string | null;
  tags?: string[];
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
  batchId: string;
  batch: string;
  executedAt: string;
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

export type QualityGateMetric =
  | "minPassRate"
  | "maxFailCount"
  | "maxBlockCount"
  | "maxPendingCount";

export interface QualityGateCheck {
  metric: QualityGateMetric;
  label: string;
  actual: number;
  threshold: number;
  passed: boolean;
  reason: string;
}

export interface QualityGateResponse {
  passed: boolean;
  reasons: string[];
  thresholds: Record<QualityGateMetric, number>;
  batch: {
    id: string;
    name: string;
    projectId: string;
    testStageId: string;
    executedAt: string;
  };
  metrics: {
    totalCount: number;
    passCount: number;
    failCount: number;
    blockCount: number;
    pendingCount: number;
    passRate: number;
  };
  checks: QualityGateCheck[];
  comparison: {
    baselineBatchId: string;
    baselineBatchName: string;
    baselinePassRate: number;
    delta: number;
    regression: boolean;
  } | null;
}

// --- 导入 ---
export type ImportType = "pre-analysis" | "post-analysis";
export type ImportMappingTemplateScope = "PERSONAL" | "PROJECT";

export interface ImportFieldMapping {
  caseNo?: string;
  name?: string;
  resultSummary?: string;
  logUrl?: string;
  progressCategory?: string;
  assignee?: string;
  rootCause?: string;
  mrOrTicket?: string;
}

export interface ImportMappingTemplateDTO {
  id: string;
  ownerId: string;
  ownerName: string;
  projectId: string | null;
  name: string;
  importType: ImportType;
  mapping: ImportFieldMapping;
  scope: ImportMappingTemplateScope;
  isOwner: boolean;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportMappingTemplatesResponse {
  templates: ImportMappingTemplateDTO[];
  canShare: boolean;
}

export interface ImportMappingTemplateResponse {
  template: ImportMappingTemplateDTO;
}

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

export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "IMPORT",
  "EXPORT",
  "ROLLBACK",
  "REUSE",
  "ARCHIVE",
  "UNARCHIVE",
  "API_KEY_CREATE",
  "API_KEY_REVOKE",
  "WEBHOOK_CREATE",
  "WEBHOOK_UPDATE",
  "WEBHOOK_DELETE",
  "WEBHOOK_SECRET_ROTATE",
  "WEBHOOK_RETRY",
  "PASSWORD_CHANGE",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  "project",
  "organization",
  "organizationMember",
  "stage",
  "batch",
  "case",
  "caseActivity",
  "user",
  "member",
  "apiKey",
  "webhook",
  "webhookDelivery",
  "asset",
  "rootCauseCategory",
  "import",
  "export",
  "session",
  "auditLog",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: "创建",
  UPDATE: "更新",
  DELETE: "删除",
  LOGIN: "登录",
  LOGOUT: "退出登录",
  IMPORT: "导入",
  EXPORT: "导出",
  ROLLBACK: "回滚",
  REUSE: "复用",
  ARCHIVE: "归档",
  UNARCHIVE: "取消归档",
  API_KEY_CREATE: "创建 API Key",
  API_KEY_REVOKE: "撤销 API Key",
  WEBHOOK_CREATE: "创建 Webhook",
  WEBHOOK_UPDATE: "更新 Webhook",
  WEBHOOK_DELETE: "删除 Webhook",
  WEBHOOK_SECRET_ROTATE: "轮换 Webhook 密钥",
  WEBHOOK_RETRY: "重试 Webhook 投递",
  PASSWORD_CHANGE: "修改密码",
};

export const AUDIT_ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  project: "项目",
  organization: "组织",
  organizationMember: "组织成员",
  stage: "测试阶段",
  batch: "批跑",
  case: "用例",
  caseActivity: "用例动态",
  user: "用户",
  member: "项目成员",
  apiKey: "API Key",
  webhook: "Webhook",
  webhookDelivery: "Webhook 投递",
  asset: "知识资产",
  rootCauseCategory: "根因分类",
  import: "导入记录",
  export: "数据导出",
  session: "登录会话",
  auditLog: "审计日志",
};

export interface AuditLogDTO {
  id: string;
  userId: string;
  username: string;
  action: AuditAction;
  entityType: AuditEntityType;
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

export type ApiKeyScope = "IMPORT";
export type ApiKeyStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface ApiKeyResponse {
  id: string;
  prefix: string;
  description: string;
  scopes: ApiKeyScope[];
  status: ApiKeyStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyCreateResponse extends ApiKeyResponse {
  key: string;
}

export interface ApiKeysListResponse {
  keys: ApiKeyResponse[];
}

// ============ Webhook ============

export type WebhookEventType =
  | "IMPORT_COMPLETED"
  | "IMPORT_FAILED"
  | "QUALITY_GATE_FAILED"
  | "REPORT_GENERATED";

export type WebhookDeliveryStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED";

export interface WebhookEndpointDTO {
  id: string;
  projectId: string;
  url: string;
  active: boolean;
  events: WebhookEventType[];
  secretPrefix: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpointCreateResponse {
  webhook: WebhookEndpointDTO;
  secret: string;
}

export interface WebhookEndpointsResponse {
  webhooks: WebhookEndpointDTO[];
}

export interface WebhookDeliveryDTO {
  id: string;
  eventId: string;
  event: WebhookEventType;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveriesResponse {
  deliveries: WebhookDeliveryDTO[];
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
