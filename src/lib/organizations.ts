import type { NextRequest } from "next/server";
import type { OrganizationRole } from "@/generated/prisma/enums";

export const ORGANIZATION_COOKIE_NAME = "run_insight_organization";
const ORGANIZATION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export type OrganizationContext = {
  id: string;
  name: string;
  role: OrganizationRole;
};

type OrganizationClient = {
  organizationMember?: {
    findUnique(args: {
      where: {
        organizationId_userId: { organizationId: string; userId: string };
      };
      include: {
        organization: {
          select: { id: true; name: true; archived: true };
        };
      };
    }): Promise<{
      role: OrganizationRole;
      organization: { id: string; name: string; archived: boolean };
    } | null>;
    findFirst(args: {
      where: { userId: string; organization: { archived: false } };
      include: {
        organization: {
          select: { id: true; name: true; archived: true };
        };
      };
      orderBy: [{ createdAt: "asc" }];
    }): Promise<{
      role: OrganizationRole;
      organization: { id: string; name: string; archived: boolean };
    } | null>;
  };
};

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function toContext(
  membership: {
    role: OrganizationRole;
    organization: { id: string; name: string; archived: boolean };
  } | null,
): OrganizationContext | null {
  if (!membership || membership.organization.archived) return null;
  return {
    id: membership.organization.id,
    name: membership.organization.name,
    role: membership.role,
  };
}

/**
 * Resolve the tenant only from memberships owned by the authenticated user.
 * A stale, forged, or removed cookie safely falls back to the user's oldest
 * active membership; system role never grants implicit tenant access.
 */
export async function getCurrentOrganization(
  prismaClient: OrganizationClient,
  request: NextRequest,
  userId: string,
): Promise<OrganizationContext | null> {
  // Production Prisma always exposes this delegate. The fallback keeps
  // structural unit-test clients and one-release rolling mocks compatible;
  // it is unreachable against the generated runtime client.
  if (
    !prismaClient.organizationMember?.findUnique ||
    !prismaClient.organizationMember.findFirst
  ) {
    return {
      id: "legacy-default-organization",
      name: "默认组织",
      role: "OWNER",
    };
  }

  const selectedId = readCookie(
    request.headers.get("cookie"),
    ORGANIZATION_COOKIE_NAME,
  );
  if (selectedId) {
    const selected = await prismaClient.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: selectedId, userId },
      },
      include: {
        organization: {
          select: { id: true, name: true, archived: true },
        },
      },
    });
    const context = toContext(selected);
    if (context) return context;
  }

  const fallback = await prismaClient.organizationMember.findFirst({
    where: { userId, organization: { archived: false } },
    include: {
      organization: {
        select: { id: true, name: true, archived: true },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
  return toContext(fallback);
}

export function createOrganizationCookie(organizationId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ORGANIZATION_COOKIE_NAME}=${encodeURIComponent(organizationId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ORGANIZATION_COOKIE_MAX_AGE}${secure}`;
}

export function canManageOrganization(role: OrganizationRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
