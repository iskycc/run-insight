/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { OrganizationSwitcher } from "@/components/organizations/OrganizationSwitcher";

const originalFetch = globalThis.fetch;

describe("OrganizationSwitcher", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("shows only the server-validated current organization in the compact header control", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organizations: [
          { id: "o1", name: "研发组织", role: "OWNER" },
          { id: "o2", name: "质量组织", role: "MEMBER" },
        ],
        currentOrganizationId: "o2",
      }),
    }) as jest.Mock;

    render(<OrganizationSwitcher />);

    expect(await screen.findByRole("combobox", { name: "当前组织" }))
      .toHaveValue("o2");
    expect(screen.queryByRole("link", { name: "管理组织" }))
      .not.toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/organizations", {
      cache: "no-store",
    });
  });

  it("offers organization creation when the user has no memberships", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organizations: [],
        currentOrganizationId: null,
      }),
    }) as jest.Mock;
    render(<OrganizationSwitcher />);
    expect(await screen.findByRole("link", { name: "创建组织" }))
      .toHaveAttribute("href", "/organizations/settings");
  });
});
