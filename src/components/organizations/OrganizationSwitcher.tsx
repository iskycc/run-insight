"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Select } from "@/components/shared/Select";

type Organization = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

export function OrganizationSwitcher() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof fetch !== "function") return;
    let cancelled = false;
    void fetch("/api/organizations", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as {
          organizations: Organization[];
          currentOrganizationId: string | null;
        };
        if (!cancelled) {
          setOrganizations(data.organizations);
          setCurrentId(data.currentOrganizationId ?? "");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchOrganization(organizationId: string) {
    setCurrentId(organizationId);
    setBusy(true);
    try {
      const response = await fetch("/api/organizations/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (response.ok) window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (organizations.length === 0) {
    return (
      <Link
        href="/organizations/settings"
        className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary"
      >
        创建组织
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        id="organization-switcher"
        aria-label="当前组织"
        value={currentId}
        disabled={busy}
        onChange={(event) => void switchOrganization(event.target.value)}
        className="h-10 max-w-40 rounded-lg bg-surface-solid px-2.5 py-2 text-sm text-text-primary"
        options={organizations.map((organization) => ({
          value: organization.id,
          label: organization.name,
        }))}
      />
      <Link
        href="/organizations/settings"
        aria-label="管理组织"
        className="rounded-lg px-2 py-2 text-sm text-text-secondary hover:bg-bg"
      >
        管理
      </Link>
    </div>
  );
}
