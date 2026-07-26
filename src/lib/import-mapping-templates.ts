import type {
  ImportFieldMapping,
  ImportMappingTemplateDTO,
  ImportMappingTemplateScope,
  ImportType,
} from "@/types";

const MAPPING_FIELDS = [
  "caseNo",
  "name",
  "resultSummary",
  "logUrl",
  "progressCategory",
  "assignee",
  "rootCause",
  "mrOrTicket",
] as const satisfies readonly (keyof ImportFieldMapping)[];

const MAPPING_FIELD_SET = new Set<string>(MAPPING_FIELDS);

type MappingValidationResult =
  | { ok: true; mapping: ImportFieldMapping }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateImportFieldMapping(
  value: unknown,
): MappingValidationResult {
  if (!isRecord(value)) {
    return { ok: false, error: "字段映射必须是对象" };
  }

  const unknownKey = Object.keys(value).find(
    (key) => !MAPPING_FIELD_SET.has(key),
  );
  if (unknownKey) {
    return { ok: false, error: `不支持的系统字段：${unknownKey}` };
  }

  const mapping: ImportFieldMapping = {};
  const usedHeaders = new Set<string>();
  for (const field of MAPPING_FIELDS) {
    const raw = value[field];
    if (raw === undefined || raw === "") continue;
    if (typeof raw !== "string") {
      return { ok: false, error: `字段 ${field} 对应的文件列必须是字符串` };
    }
    const header = raw.trim();
    if (!header) continue;
    if (header.length > 255) {
      return { ok: false, error: `字段 ${field} 对应的文件列长度不能超过255个字符` };
    }
    if (usedHeaders.has(header)) {
      return { ok: false, error: `文件列“${header}”不能重复映射` };
    }
    usedHeaders.add(header);
    mapping[field] = header;
  }

  if (Object.keys(mapping).length === 0) {
    return { ok: false, error: "字段映射不能为空" };
  }
  return { ok: true, mapping };
}

export function importFieldMappingToJson(
  mapping: ImportFieldMapping,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mapping).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function validateImportMappingTemplateName(
  value: unknown,
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const name = value.trim();
  return name.length <= 100 ? name : null;
}

export function isImportType(value: unknown): value is ImportType {
  return value === "pre-analysis" || value === "post-analysis";
}

export function isImportMappingTemplateScope(
  value: unknown,
): value is ImportMappingTemplateScope {
  return value === "PERSONAL" || value === "PROJECT";
}

export function serializeImportMappingTemplate(
  template: {
    id: string;
    ownerId: string;
    owner?: { username: string };
    projectId: string | null;
    name: string;
    importType: string;
    mapping: unknown;
    scope: ImportMappingTemplateScope;
    createdAt: Date;
    updatedAt: Date;
  },
  requesterId: string,
  canManage: boolean,
  fallbackOwnerName?: string,
): ImportMappingTemplateDTO {
  return {
    id: template.id,
    ownerId: template.ownerId,
    ownerName:
      template.owner?.username ?? fallbackOwnerName ?? "未知用户",
    projectId: template.projectId,
    name: template.name,
    importType: template.importType as ImportType,
    mapping: template.mapping as ImportFieldMapping,
    scope: template.scope,
    isOwner: template.ownerId === requesterId,
    canManage,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}
