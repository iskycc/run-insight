import { getProjectAccess } from "@/lib/project-access";

function client(options: {
  systemRole?: "ADMIN" | "EDITOR" | "VIEWER";
  organizationRole?: "OWNER" | "ADMIN" | "MEMBER" | null;
  projectRole?: "ADMIN" | "EDITOR" | "VIEWER" | null;
  project?: boolean;
  user?: boolean;
} = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(
        options.user === false ? null : { role: options.systemRole ?? "EDITOR" },
      ),
    },
    project: {
      findUnique: jest.fn().mockResolvedValue(
        options.project === false ? null : { organizationId: "o1" },
      ),
    },
    organizationMember: {
      findUnique: jest.fn().mockResolvedValue(
        options.organizationRole === null
          ? null
          : { role: options.organizationRole ?? "MEMBER" },
      ),
    },
    projectMember: {
      findUnique: jest.fn().mockResolvedValue(
        options.projectRole === null
          ? null
          : { role: options.projectRole ?? "VIEWER" },
      ),
    },
  };
}

describe("getProjectAccess tenant boundary", () => {
  it("grants organization owners project administration", async () => {
    const prisma = client({ systemRole: "ADMIN", organizationRole: "OWNER", projectRole: null });
    await expect(getProjectAccess(prisma, "u1", "p1")).resolves.toMatchObject({
      canView: true,
      canEdit: true,
      canAdmin: true,
    });
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
  });

  it("does not let a system administrator cross an organization boundary", async () => {
    const prisma = client({
      systemRole: "ADMIN",
      organizationRole: null,
      projectRole: "ADMIN",
    });
    await expect(getProjectAccess(prisma, "u1", "p1")).resolves.toMatchObject({
      canView: false,
      canEdit: false,
      canAdmin: false,
    });
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["ADMIN", true, true, true],
    ["EDITOR", true, true, false],
    ["VIEWER", true, false, false],
  ] as const)("maps project role %s for organization members", async (
    projectRole,
    canView,
    canEdit,
    canAdmin,
  ) => {
    const prisma = client({ organizationRole: "MEMBER", projectRole });
    await expect(getProjectAccess(prisma, "u1", "p1")).resolves.toMatchObject({
      projectRole,
      canView,
      canEdit,
      canAdmin,
    });
  });

  it("denies organization members without a project membership", async () => {
    const prisma = client({ organizationRole: "MEMBER", projectRole: null });
    await expect(getProjectAccess(prisma, "u1", "p1")).resolves.toMatchObject({
      canView: false,
      canEdit: false,
      canAdmin: false,
    });
  });

  it("returns null for a missing user or project", async () => {
    await expect(
      getProjectAccess(client({ user: false }), "u1", "p1"),
    ).resolves.toBeNull();
    await expect(
      getProjectAccess(client({ project: false }), "u1", "p1"),
    ).resolves.toBeNull();
  });
});
