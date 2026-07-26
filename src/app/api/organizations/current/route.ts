import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, parseJsonObject } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { createOrganizationCookie } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = await parseJsonObject(request, ["organizationId"]);
  if (!parsed.ok) return parsed.response;
  const organizationId = parsed.value.organizationId;
  if (typeof organizationId !== "string" || !organizationId) {
    return jsonError("VALIDATION_ERROR", "请选择组织");
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: auth.userId },
    },
    include: {
      organization: { select: { id: true, name: true, archived: true } },
    },
  });
  if (!membership || membership.organization.archived) {
    return jsonError("NOT_FOUND", "组织不存在或无权访问", 404);
  }

  const response = NextResponse.json({
    currentOrganization: {
      id: membership.organization.id,
      name: membership.organization.name,
      role: membership.role,
    },
  });
  response.headers.set("set-cookie", createOrganizationCookie(organizationId));
  await writeAuditLog({
    userId: auth.userId,
    action: "UPDATE",
    entityType: "organization",
    entityId: organizationId,
    changes: { currentOrganization: true },
  });
  return response;
}
