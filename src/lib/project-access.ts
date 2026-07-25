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
  projectMember: {
    findUnique(args: {
      where: { projectId_userId: { projectId: string; userId: string } };
      select: { role: true };
    }): Promise<{ role: ProjectRole } | null>;
  };
};

/**
 * Central project authorization helper. System administrators always have full
 * access; other users must be explicit project members.
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

  if (user.role === "ADMIN") {
    return {
      systemRole: user.role,
      projectRole: null,
      canView: true,
      canEdit: true,
      canAdmin: true,
    };
  }

  if (!prismaClient.projectMember?.findUnique) {
    return {
      systemRole: user.role,
      projectRole: null,
      canView: false,
      canEdit: false,
      canAdmin: false,
    };
  }
  const membership = await prismaClient.projectMember.findUnique({
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
