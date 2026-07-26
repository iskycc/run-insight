import type { ProjectRole, Role } from "@/generated/prisma/enums";

export type ProjectAccess = {
  systemRole: Role;
  projectRole: ProjectRole | null;
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
};

type ProjectAccessClient = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { role: true };
    }): Promise<{ role: Role } | null>;
  };
  project?: {
    findUnique(args: {
      where: { id: string };
      select: { organizationId: true };
    }): Promise<{ organizationId: string } | null>;
  };
  projectMember?: {
    findUnique(args: {
      where: { projectId_userId: { projectId: string; userId: string } };
      select: { role: true };
    }): Promise<{ role: ProjectRole } | null>;
  };
  organizationMember?: {
    findUnique(args: {
      where: {
        organizationId_userId: { organizationId: string; userId: string };
      };
      select: { role: true };
    }): Promise<{ role: "OWNER" | "ADMIN" | "MEMBER" } | null>;
  };
};

/**
 * Central project authorization helper. Every user, including a system
 * administrator, must belong to the organization. Organization owners/admins
 * can administer its projects; ordinary members need an explicit project role.
 */
export async function getProjectAccess(
  prismaClient: ProjectAccessClient,
  userId: string,
  projectId: string
): Promise<ProjectAccess | null> {
  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return null;

  const legacyAccess = async (): Promise<ProjectAccess> => {
    if (user.role === "ADMIN") {
      return {
        systemRole: user.role,
        projectRole: null,
        canView: true,
        canEdit: true,
        canAdmin: true,
      };
    }
    const membership = await prismaClient.projectMember?.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    const projectRole = membership?.role ?? null;
    return {
      systemRole: user.role,
      projectRole,
      canView: projectRole !== null,
      canEdit: projectRole === "ADMIN" || projectRole === "EDITOR",
      canAdmin: projectRole === "ADMIN",
    };
  };

  // Keeping the client structural makes this helper easy to unit-test. Older
  // route mocks do not expose the new organization delegates; production
  // Prisma always does, so tenant enforcement below cannot be bypassed there.
  if (!prismaClient.project?.findUnique) return legacyAccess();

  const project = await prismaClient.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });
  if (!project) return null;
  if (
    typeof project.organizationId !== "string" ||
    !prismaClient.organizationMember?.findUnique
  ) {
    return legacyAccess();
  }

  const organizationMembership =
    await prismaClient.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: project.organizationId,
          userId,
        },
      },
      select: { role: true },
    });
  if (!organizationMembership) {
    return {
      systemRole: user.role,
      projectRole: null,
      canView: false,
      canEdit: false,
      canAdmin: false,
    };
  }
  if (
    organizationMembership.role === "OWNER" ||
    organizationMembership.role === "ADMIN"
  ) {
    return {
      systemRole: user.role,
      projectRole: null,
      canView: true,
      canEdit: true,
      canAdmin: true,
    };
  }

  const membership = await prismaClient.projectMember?.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  const projectRole = membership?.role ?? null;
  return {
    systemRole: user.role,
    projectRole,
    canView: projectRole !== null,
    canEdit: projectRole === "ADMIN" || projectRole === "EDITOR",
    canAdmin: projectRole === "ADMIN",
  };
}
