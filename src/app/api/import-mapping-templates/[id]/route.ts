import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
} from "@/lib/api-helpers";
import {
  importFieldMappingToJson,
  serializeImportMappingTemplate,
  validateImportFieldMapping,
  validateImportMappingTemplateName,
} from "@/lib/import-mapping-templates";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import type { ImportMappingTemplateResponse } from "@/types";

async function canManageTemplate(
  userId: string,
  template: {
    ownerId: string;
    scope: "PERSONAL" | "PROJECT";
    projectId: string | null;
  },
) {
  if (template.scope === "PERSONAL") return template.ownerId === userId;
  if (!template.projectId) return false;
  const access = await getProjectAccess(prisma, userId, template.projectId);
  return (
    access?.canAdmin === true ||
    (template.ownerId === userId && access?.canEdit === true)
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.importMappingTemplate.findUnique({
      where: { id },
    });
    if (!existing) return jsonError("NOT_FOUND", "字段映射模板不存在", 404);
    if (!(await canManageTemplate(auth.userId, existing))) {
      return jsonError("FORBIDDEN", "无权管理该字段映射模板", 403);
    }
    if (existing.scope === "PROJECT" && existing.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: existing.projectId },
        select: { archived: true },
      });
      if (project?.archived) {
        return jsonError("CONFLICT", "已归档项目的共享映射模板不能修改", 409);
      }
    }

    const parsedBody = await parseJsonObject(request, ["name", "mapping"]);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const data: { name?: string; mapping?: Record<string, string> } = {};
    if (body.name !== undefined) {
      const name = validateImportMappingTemplateName(body.name);
      if (!name) {
        return jsonError(
          "VALIDATION_ERROR",
          "模板名称不能为空且长度不能超过100个字符",
        );
      }
      const duplicate = await prisma.importMappingTemplate.findFirst({
        where: {
          ...(existing.scope === "PROJECT"
            ? { scope: existing.scope, projectId: existing.projectId }
            : { scope: existing.scope, ownerId: auth.userId }),
          importType: existing.importType,
          name,
          NOT: { id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return jsonError("CONFLICT", "同一范围内已存在同名映射模板", 409);
      }
      data.name = name;
    }
    if (body.mapping !== undefined) {
      const mappingResult = validateImportFieldMapping(body.mapping);
      if (!mappingResult.ok) {
        return jsonError("VALIDATION_ERROR", mappingResult.error);
      }
      data.mapping = importFieldMappingToJson(mappingResult.mapping);
    }
    if (Object.keys(data).length === 0) {
      return jsonError("VALIDATION_ERROR", "没有可更新的字段");
    }

    const template = await prisma.importMappingTemplate.update({
      where: { id },
      data,
      include: { owner: { select: { username: true } } },
    });
    return NextResponse.json<ImportMappingTemplateResponse>({
      template: serializeImportMappingTemplate(
        template,
        auth.userId,
        true,
        auth.username,
      ),
    });
  } catch (error) {
    return internalError("更新字段映射模板失败", {
      request,
      error,
      event: "import_mapping.update_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.importMappingTemplate.findUnique({
      where: { id },
    });
    if (!existing) return jsonError("NOT_FOUND", "字段映射模板不存在", 404);
    if (!(await canManageTemplate(auth.userId, existing))) {
      return jsonError("FORBIDDEN", "无权管理该字段映射模板", 403);
    }
    await prisma.importMappingTemplate.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return internalError("删除字段映射模板失败", {
      request,
      error,
      event: "import_mapping.delete_failed",
      context: { userId: auth.userId },
    });
  }
}
