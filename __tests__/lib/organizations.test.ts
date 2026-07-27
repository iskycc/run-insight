import { NextRequest } from "next/server";
import {
  createOrganizationCookie,
  getCurrentOrganization,
} from "@/lib/organizations";

describe("organization context", () => {
  const selected = {
    role: "ADMIN" as const,
    organization: { id: "o2", name: "组织二", archived: false },
  };
  const fallback = {
    role: "MEMBER" as const,
    organization: { id: "o1", name: "默认组织", archived: false },
  };

  it("uses a selected organization only after membership validation", async () => {
    const prisma = {
      organizationMember: {
        findUnique: jest.fn().mockResolvedValue(selected),
        findFirst: jest.fn(),
      },
    };
    const request = new NextRequest("http://localhost/api/projects", {
      headers: { cookie: "run_insight_organization=o2" },
    });
    await expect(
      getCurrentOrganization(prisma, request, "u1"),
    ).resolves.toEqual({ id: "o2", name: "组织二", role: "ADMIN" });
    expect(prisma.organizationMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId: { organizationId: "o2", userId: "u1" },
        },
      }),
    );
  });

  it("falls back safely for a stale or forged cookie", async () => {
    const prisma = {
      organizationMember: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(fallback),
      },
    };
    const request = new NextRequest("http://localhost/api/projects", {
      headers: { cookie: "run_insight_organization=not-a-membership" },
    });
    await expect(
      getCurrentOrganization(prisma, request, "u1"),
    ).resolves.toEqual({ id: "o1", name: "默认组织", role: "MEMBER" });
  });

  it("creates a protected organization cookie", () => {
    expect(createOrganizationCookie("o/1")).toContain(
      "run_insight_organization=o%2F1; HttpOnly; Path=/; SameSite=Lax",
    );
  });

  it("honors the explicit HTTP testing override", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalCookieSecure = process.env.COOKIE_SECURE;
    try {
      Object.assign(process.env, {
        NODE_ENV: "production",
        COOKIE_SECURE: "false",
      });

      expect(createOrganizationCookie("o1")).not.toContain("Secure");
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalCookieSecure === undefined) {
        delete process.env.COOKIE_SECURE;
      } else {
        process.env.COOKIE_SECURE = originalCookieSecure;
      }
    }
  });
});
