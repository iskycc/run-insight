import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
  parseRequestUrl,
} from "@/lib/api-helpers";
import {
  importFieldMappingToJson,
  isImportMappingTemplateScope,
  isImportType,
  serializeImportMappingTemplate,
  validateImportFieldMapping,
  validateImportMappingTemplateName,
} from "@/lib/import-mapping-templates";
import { prisma } from "@/lib/prisma";
import { getProjectAccess, type ProjectAccess } from "@/lib/project-access";
import type {
  ImportMappingTemplateResponse,
  ImportMappingTemplatesResponse,
} from "@/types";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsedUrl = parseRequestUrl(request);
    if (!parsedUrl.ok) return parsedUrl.response;
    const { searchParams } = parsedUrl.value;
    const importType = searchParams.get("importType");
    const projectId = searchParams.get("projectId");
    if (!isImportType(importType)) {
      return jsonError("VALIDATION_ERROR", "导入类型不合法");
    }

    let projectAccess: ProjectAccess | null = null;
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, archived: true },
      });
      if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
      projectAccess = await getProjectAccess(prisma, auth.userId, projectId);
      if (!projectAccess?.canView) {
        return jsonError("FORBIDDEN", "无权查看该项目的共享映射模板", 403);
      }
    }

    const templates = await prisma.importMappingTemplate.findMany({
      where: {
        importType,
        OR: [
          { ownerId: auth.userId, scope: "PERSONAL" },
          ...(projectId ? [{ projectId, scope: "PROJECT" as const }] : []),
        ],
      },
      include: { owner: { select: { username: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json<ImportMappingTemplatesResponse>({
      templates: templates.map((template) =>
        serializeImportMappingTemplate(
          template,
          auth.userId,
          template.scope === "PERSONAL"
            ? template.ownerId === auth.userId
            : projectAccess?.canAdmin === true ||
                (template.ownerId === auth.userId && projectAccess?.canEdit === true),
        ),
      ),
      canShare: projectAccess?.canEdit === true,
    });
  } catch (error) {
    return internalError("获取字段映射模板失败", {
      request,
      error,
      event: "import_mapping.list_failed",
      context: { userId: auth.userId },
    });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsedBody = await parseJsonObject(request, [
      "name",
      "importType",
      "mapping",
      "scope",
      "projectId",
    ]);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const name = validateImportMappingTemplateName(body.name);
    if (!name) {
      return jsonError(
        "VALIDATION_ERROR",
        "模板名称不能为空且长度不能超过100个字符",
      );
    }
    if (!isImportType(body.importType)) {
      return jsonError("VALIDATION_ERROR", "导入类型不合法");
    }
    const mappingResult = validateImportFieldMapping(body.mapping);
    if (!mappingResult.ok) {
      return jsonError("VALIDATION_ERROR", mappingResult.error);
    }
    const scope = body.scope ?? "PERSONAL";
    if (!isImportMappingTemplateScope(scope)) {
      return jsonError("VALIDATION_ERROR", "模板范围不合法");
    }

    let projectId: string | null = null;
    if (scope === "PROJECT") {
      if (typeof body.projectId !== "string" || !body.projectId) {
        return jsonError("VALIDATION_ERROR", "项目共享模板必须指定项目");
      }
      projectId = body.projectId;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, archived: true },
      });
      if (!project) return jsonError("NOT_FOUND", "项目不存在", 404);
      if (project.archived) {
        return jsonError("CONFLICT", "不能在已归档项目创建共享映射模板", 409);
      }
      const access = await getProjectAccess(prisma, auth.userId, projectId);
      if (!access?.canEdit) {
        return jsonError("FORBIDDEN", "无权在该项目创建共享映射模板", 403);
      }
    } else if (body.projectId !== undefined && body.projectId !== null) {
      return jsonError("VALIDATION_ERROR", "个人模板不能指定共享项目");
    }

    const duplicate = await prisma.importMappingTemplate.findFirst({
      where:
        scope === "PROJECT"
          ? { scope, projectId, importType: body.importType, name }
          : {
              scope,
              ownerId: auth.userId,
              importType: body.importType,
              name,
            },
      select: { id: true },
    });
    if (duplicate) {
      return jsonError("CONFLICT", "同一范围内已存在同名映射模板", 409);
    }

    const template = await prisma.importMappingTemplate.create({
      data: {
        ownerId: auth.userId,
        projectId,
        name,
        importType: body.importType,
        mapping: importFieldMappingToJson(mappingResult.mapping),
        scope,
      },
      include: { owner: { select: { username: true } } },
    });

    return NextResponse.json<ImportMappingTemplateResponse>(
      {
        template: serializeImportMappingTemplate(
          template,
          auth.userId,
          true,
          auth.username,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return internalError("创建字段映射模板失败", {
      request,
      error,
      event: "import_mapping.create_failed",
      context: { userId: auth.userId },
    });
  }
}
