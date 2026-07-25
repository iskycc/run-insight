import { getProjectAccess } from "@/lib/project-access";

describe("getProjectAccess", () => {
  it("grants system administrators full access without a membership", async () => {
    const client = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
      projectMember: { findUnique: jest.fn() },
    };

    const access = await getProjectAccess(client as never, "u1", "p1");

    expect(access).toMatchObject({ canView: true, canEdit: true, canAdmin: true });
    expect(client.projectMember.findUnique).not.toHaveBeenCalled();
  });

  it("maps an editor membership to view and edit access", async () => {
    const client = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "EDITOR" }) },
      projectMember: { findUnique: jest.fn().mockResolvedValue({ role: "EDITOR" }) },
    };

    const access = await getProjectAccess(client as never, "u1", "p1");

    expect(access).toMatchObject({ canView: true, canEdit: true, canAdmin: false });
  });

  it("maps a viewer membership to view-only access", async () => {
    const client = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "EDITOR" }) },
      projectMember: { findUnique: jest.fn().mockResolvedValue({ role: "VIEWER" }) },
    };

    const access = await getProjectAccess(client as never, "u1", "p1");

    expect(access).toMatchObject({
      canView: true,
      canEdit: false,
      canAdmin: false,
    });
  });

  it("denies non-members", async () => {
    const client = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "EDITOR" }) },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const access = await getProjectAccess(client as never, "u1", "p1");

    expect(access).toMatchObject({ canView: false, canEdit: false, canAdmin: false });
  });

  it("returns null when the authenticated user no longer exists", async () => {
    const client = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      projectMember: { findUnique: jest.fn() },
    };

    await expect(getProjectAccess(client as never, "missing", "p1")).resolves.toBeNull();
    expect(client.projectMember.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed when the client has no projectMember delegate", async () => {
    const client = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "EDITOR" }) },
    };

    await expect(getProjectAccess(client as never, "u1", "p1")).resolves.toEqual({
      systemRole: "EDITOR",
      projectRole: null,
      canView: false,
      canEdit: false,
      canAdmin: false,
    });
  });

  it("maps a project administrator to all project capabilities", async () => {
    const client = {
      user: { findUnique: jest.fn().mockResolvedValue({ role: "VIEWER" }) },
      projectMember: { findUnique: jest.fn().mockResolvedValue({ role: "ADMIN" }) },
    };

    await expect(getProjectAccess(client as never, "u1", "p1")).resolves.toMatchObject({
      projectRole: "ADMIN",
      canView: true,
      canEdit: true,
      canAdmin: true,
    });
  });
});
