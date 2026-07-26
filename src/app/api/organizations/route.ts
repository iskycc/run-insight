import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { internalError, jsonError, parseJsonObject } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createOrganizationCookie, getCurrentOrganization } from "@/lib/organizations";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const [memberships, current] = await Promise.all([
      prisma.organizationMember.findMany({
        where: { userId: auth.userId, organization: { archived: false } },
        include: {
          organization: {
            select: { id: true, name: true, archived: true, createdAt: true },
          },
        },
        orderBy: [{ createdAt: "asc" }],
      }),
      getCurrentOrganization(prisma, request, auth.userId),
    ]);
    return NextResponse.json({
      organizations: memberships.map(({ role, organization }) => ({
        id: organization.id,
        name: organization.name,
        archived: organization.archived,
        role,
        createdAt: organization.createdAt.toISOString(),
      })),
      currentOrganizationId: current?.id ?? null,
    });
  } catch (error) {
    return internalError("获取组织列表失败", {
      request,
      error,
      event: "organization.list_failed",
    });
  }
}
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsed = await parseJsonObject(request, ["name"]);
    if (!parsed.ok) return parsed.response;
    if (typeof parsed.value.name !== "string") {
      return jsonError("VALIDATION_ERROR", "组织名称不能为空");
    }
    const name = parsed.value.name.trim();
    if (!name) return jsonError("VALIDATION_ERROR", "组织名称不能为空");
    if (name.length > 100) {
      return jsonError("VALIDATION_ERROR", "组织名称长度不能超过100个字符");
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        members: { create: { userId: auth.userId, role: "OWNER" } },
      },
      select: { id: true, name: true, archived: true, createdAt: true },
    });
    await writeAuditLog({
      userId: auth.userId,
      action: "CREATE",
      entityType: "organization",
      entityId: organization.id,
      changes: { name: organization.name, role: "OWNER" },
    });

    const response = NextResponse.json(
      {
        organization: {
          ...organization,
          role: "OWNER",
          createdAt: organization.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
    response.headers.set("set-cookie", createOrganizationCookie(organization.id));
    return response;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return jsonError("CONFLICT", "组织名称已存在", 409);
    }
    return internalError("创建组织失败", {
      request,
      error,
      event: "organization.create_failed",
    });
  }
}
