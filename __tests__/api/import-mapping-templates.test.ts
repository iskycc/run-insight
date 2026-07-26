import {
  GET,
  POST,
} from "@/app/api/import-mapping-templates/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/import-mapping-templates/[id]/route";
import { generateToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
    importMappingTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const now = new Date("2026-07-26T00:00:00.000Z");
const personalTemplate = {
  id: "template_1",
  ownerId: "user_1",
  projectId: null,
  name: "标准 CSV",
  importType: "pre-analysis",
  mapping: { caseNo: "编号", name: "名称" },
  scope: "PERSONAL" as const,
  createdAt: now,
  updatedAt: now,
  owner: { username: "alice" },
};
const projectTemplate = {
  ...personalTemplate,
  id: "template_2",
  projectId: "project_1",
  name: "项目模板",
  scope: "PROJECT" as const,
};

function request(path: string, method = "GET", body?: unknown, authenticated = true) {
  const req = new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  if (authenticated) {
    req.headers.set(
      "cookie",
      `run_insight_token=${generateToken({
        userId: "user_1",
        username: "alice",
      })}`,
    );
  }
  return req;
}

const routeParams = { params: Promise.resolve({ id: "template_1" }) };

describe("import mapping template APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project_1",
    });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    (mockPrisma.importMappingTemplate.findFirst as jest.Mock).mockResolvedValue(
      null,
    );
  });

  it("requires authentication", async () => {
    const response = await GET(
      request(
        "/api/import-mapping-templates?importType=pre-analysis",
        "GET",
        undefined,
        false,
      ),
    );
    expect(response.status).toBe(401);
  });

  it("lists personal templates for one import type", async () => {
    (mockPrisma.importMappingTemplate.findMany as jest.Mock).mockResolvedValue([
      personalTemplate,
    ]);

    const response = await GET(
      request("/api/import-mapping-templates?importType=pre-analysis"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canShare).toBe(false);
    expect(body.templates[0]).toEqual(
      expect.objectContaining({
        name: "标准 CSV",
        importType: "pre-analysis",
        isOwner: true,
        canManage: true,
      }),
    );
    expect(mockPrisma.importMappingTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          importType: "pre-analysis",
          OR: [{ ownerId: "user_1", scope: "PERSONAL" }],
        },
      }),
    );
  });

  it("lists shared project templates for project viewers", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });
    (mockPrisma.importMappingTemplate.findMany as jest.Mock).mockResolvedValue([
      projectTemplate,
    ]);

    const response = await GET(
      request(
        "/api/import-mapping-templates?importType=pre-analysis&projectId=project_1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canShare).toBe(false);
    expect(body.templates[0].canManage).toBe(false);
  });

  it("validates the list import type and project access", async () => {
    const invalidType = await GET(
      request("/api/import-mapping-templates?importType=unknown"),
    );
    expect(invalidType.status).toBe(400);

    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    const forbidden = await GET(
      request(
        "/api/import-mapping-templates?importType=pre-analysis&projectId=project_1",
      ),
    );
    expect(forbidden.status).toBe(403);
  });

  it("creates a trimmed personal template", async () => {
    (mockPrisma.importMappingTemplate.create as jest.Mock).mockResolvedValue(
      personalTemplate,
    );

    const response = await POST(
      request("/api/import-mapping-templates", "POST", {
        name: "  标准 CSV ",
        importType: "pre-analysis",
        mapping: { caseNo: " 编号 ", name: "名称", logUrl: "" },
        scope: "PERSONAL",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockPrisma.importMappingTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user_1",
          projectId: null,
          name: "标准 CSV",
          importType: "pre-analysis",
          mapping: { caseNo: "编号", name: "名称" },
          scope: "PERSONAL",
        }),
      }),
    );
  });

  it.each([
    [{ mapping: { injected: "列" } }, "不支持的系统字段"],
    [{ mapping: { caseNo: 123 } }, "必须是字符串"],
    [{ mapping: { caseNo: "编号", name: "编号" } }, "不能重复映射"],
    [{ mapping: {} }, "不能为空"],
    [{ mapping: [] }, "必须是对象"],
    [{ importType: "other", mapping: { caseNo: "编号" } }, "导入类型不合法"],
  ])("rejects invalid mapping payload %#", async (patch, message) => {
    const response = await POST(
      request("/api/import-mapping-templates", "POST", {
        name: "模板",
        importType: "pre-analysis",
        ...patch,
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain(message);
  });

  it("rejects unknown top-level template fields", async () => {
    const response = await POST(
      request("/api/import-mapping-templates", "POST", {
        name: "模板",
        importType: "pre-analysis",
        mapping: { caseNo: "编号" },
        unexpected: true,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      message: "不支持的字段：unexpected",
    });
    expect(mockPrisma.importMappingTemplate.create).not.toHaveBeenCalled();
  });

  it("allows project editors to create shared templates", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.importMappingTemplate.create as jest.Mock).mockResolvedValue(
      projectTemplate,
    );

    const response = await POST(
      request("/api/import-mapping-templates", "POST", {
        name: "项目模板",
        importType: "pre-analysis",
        mapping: { caseNo: "编号" },
        scope: "PROJECT",
        projectId: "project_1",
      }),
    );
    expect(response.status).toBe(201);
  });

  it("returns 404 when a shared template targets a missing project", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      request("/api/import-mapping-templates", "POST", {
        name: "项目模板",
        importType: "pre-analysis",
        mapping: { caseNo: "编号" },
        scope: "PROJECT",
        projectId: "missing_project",
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "NOT_FOUND",
      message: "项目不存在",
    });
  });

  it("forbids project viewers from creating shared templates", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "VIEWER" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "VIEWER",
    });

    const response = await POST(
      request("/api/import-mapping-templates", "POST", {
        name: "项目模板",
        importType: "pre-analysis",
        mapping: { caseNo: "编号" },
        scope: "PROJECT",
        projectId: "project_1",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects shared templates for archived projects", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project_1",
      archived: true,
    });

    const response = await POST(
      request("/api/import-mapping-templates", "POST", {
        name: "归档项目模板",
        importType: "pre-analysis",
        mapping: { caseNo: "编号" },
        scope: "PROJECT",
        projectId: "project_1",
      }),
    );

    expect(response.status).toBe(409);
    expect(mockPrisma.importMappingTemplate.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate template names in the same scope and import type", async () => {
    (mockPrisma.importMappingTemplate.findFirst as jest.Mock).mockResolvedValue({
      id: "existing",
    });
    const response = await POST(
      request("/api/import-mapping-templates", "POST", {
        name: "标准 CSV",
        importType: "pre-analysis",
        mapping: { caseNo: "编号" },
      }),
    );
    expect(response.status).toBe(409);
  });

  it("updates an owned template mapping", async () => {
    (mockPrisma.importMappingTemplate.findUnique as jest.Mock).mockResolvedValue({
      ...personalTemplate,
      owner: undefined,
    });
    (mockPrisma.importMappingTemplate.update as jest.Mock).mockResolvedValue({
      ...personalTemplate,
      mapping: { caseNo: "用例号" },
      owner: undefined,
    });

    const response = await PATCH(
      request("/api/import-mapping-templates/template_1", "PATCH", {
        mapping: { caseNo: "用例号" },
      }),
      routeParams,
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.importMappingTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { mapping: { caseNo: "用例号" } },
      }),
    );
  });

  it("forbids managing another user's template", async () => {
    (mockPrisma.importMappingTemplate.findUnique as jest.Mock).mockResolvedValue({
      ...personalTemplate,
      ownerId: "user_2",
      owner: undefined,
    });

    const patched = await PATCH(
      request("/api/import-mapping-templates/template_1", "PATCH", {
        name: "改名",
      }),
      routeParams,
    );
    const deleted = await DELETE(
      request("/api/import-mapping-templates/template_1", "DELETE"),
      routeParams,
    );
    expect(patched.status).toBe(403);
    expect(deleted.status).toBe(403);
  });

  it("lets a project administrator manage another owner's shared template", async () => {
    (mockPrisma.importMappingTemplate.findUnique as jest.Mock).mockResolvedValue({
      ...projectTemplate,
      ownerId: "user_2",
      owner: undefined,
    });
    (mockPrisma.importMappingTemplate.update as jest.Mock).mockResolvedValue({
      ...projectTemplate,
      ownerId: "user_2",
      name: "管理员修订",
      owner: { username: "bob" },
    });

    const response = await PATCH(
      request("/api/import-mapping-templates/template_2", "PATCH", {
        name: "管理员修订",
      }),
      { params: Promise.resolve({ id: "template_2" }) },
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.importMappingTemplate.update).toHaveBeenCalled();
  });

  it("does not let a project editor take over another owner's shared template", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ role: "EDITOR" });
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: "EDITOR",
    });
    (mockPrisma.importMappingTemplate.findUnique as jest.Mock).mockResolvedValue({
      ...projectTemplate,
      ownerId: "user_2",
      owner: undefined,
    });

    const response = await PATCH(
      request("/api/import-mapping-templates/template_2", "PATCH", {
        name: "越权修改",
      }),
      { params: Promise.resolve({ id: "template_2" }) },
    );

    expect(response.status).toBe(403);
    expect(mockPrisma.importMappingTemplate.update).not.toHaveBeenCalled();
  });

  it("blocks modifications to shared templates in archived projects", async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: "project_1",
      archived: true,
    });
    (mockPrisma.importMappingTemplate.findUnique as jest.Mock).mockResolvedValue({
      ...projectTemplate,
      owner: undefined,
    });

    const response = await PATCH(
      request("/api/import-mapping-templates/template_2", "PATCH", {
        name: "归档后修改",
      }),
      { params: Promise.resolve({ id: "template_2" }) },
    );

    expect(response.status).toBe(409);
    expect(mockPrisma.importMappingTemplate.update).not.toHaveBeenCalled();
  });

  it("deletes an owned template", async () => {
    (mockPrisma.importMappingTemplate.findUnique as jest.Mock).mockResolvedValue({
      ...personalTemplate,
      owner: undefined,
    });
    (mockPrisma.importMappingTemplate.delete as jest.Mock).mockResolvedValue(
      personalTemplate,
    );

    const response = await DELETE(
      request("/api/import-mapping-templates/template_1", "DELETE"),
      routeParams,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
  });
});
