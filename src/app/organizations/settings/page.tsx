"use client";

import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Select } from "@/components/shared/Select";

type Organization = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};
type Member = {
  id: string;
  userId: string;
  username: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message ?? "操作失败";
  } catch {
    return "操作失败";
  }
}

export default function OrganizationSettingsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [actorRole, setActorRole] = useState<Organization["role"]>("MEMBER");
  const [newOrganizationName, setNewOrganizationName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Organization["role"]>("MEMBER");
  const [message, setMessage] = useState("");

  const loadOrganizations = useCallback(async () => {
    const response = await fetch("/api/organizations", { cache: "no-store" });
    if (!response.ok) throw new Error(await responseMessage(response));
    const data = await response.json() as {
      organizations: Organization[];
      currentOrganizationId: string | null;
    };
    setOrganizations(data.organizations);
    setCurrentId((value) => value || data.currentOrganizationId || data.organizations[0]?.id || "");
  }, []);

  const loadMembers = useCallback(async () => {
    if (!currentId) {
      setMembers([]);
      return;
    }
    const response = await fetch(`/api/organizations/${currentId}/members`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    const data = await response.json() as {
      members: Member[];
      actorRole: Organization["role"];
    };
    setMembers(data.members);
    setActorRole(data.actorRole);
  }, [currentId]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/organizations", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        return response.json() as Promise<{
          organizations: Organization[];
          currentOrganizationId: string | null;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setOrganizations(data.organizations);
        setCurrentId(
          data.currentOrganizationId || data.organizations[0]?.id || "",
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "加载组织失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    void fetch(`/api/organizations/${currentId}/members`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        return response.json() as Promise<{
          members: Member[];
          actorRole: Organization["role"];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setMembers(data.members);
        setActorRole(data.actorRole);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "加载成员失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  async function createOrganization() {
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newOrganizationName }),
    });
    if (!response.ok) {
      setMessage(await responseMessage(response));
      return;
    }
    const data = await response.json() as { organization: Organization };
    setNewOrganizationName("");
    setCurrentId(data.organization.id);
    setMessage("组织已创建");
    await loadOrganizations();
  }

  async function addMember() {
    const response = await fetch(`/api/organizations/${currentId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role }),
    });
    if (!response.ok) {
      setMessage(await responseMessage(response));
      return;
    }
    setUsername("");
    setMessage("成员已添加");
    await loadMembers();
  }

  async function updateMember(memberId: string, nextRole: Organization["role"]) {
    const response = await fetch(
      `/api/organizations/${currentId}/members/${memberId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      },
    );
    if (!response.ok) setMessage(await responseMessage(response));
    else await loadMembers();
  }

  async function removeMember(memberId: string) {
    if (!window.confirm("确定移除此组织成员？其项目成员资格也会一并移除。")) return;
    const response = await fetch(
      `/api/organizations/${currentId}/members/${memberId}`,
      { method: "DELETE" },
    );
    if (!response.ok) setMessage(await responseMessage(response));
    else await loadMembers();
  }

  const canManage = actorRole === "OWNER" || actorRole === "ADMIN";

  return (
    <PageContainer
      title="组织管理"
      subtitle="项目和数据始终隔离在当前组织内。"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        {message && <p role="status" className="rounded-lg bg-bg p-3 text-sm">{message}</p>}

        <section className="rounded-xl border border-border bg-surface-solid p-5">
          <h2 className="font-medium">组织</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Select
              aria-label="管理的组织"
              value={currentId}
              onChange={(event) => setCurrentId(event.target.value)}
              className="h-10 min-w-48 rounded-lg bg-surface-solid px-3 py-2"
              options={organizations.map((organization) => ({
                value: organization.id,
                label: organization.name,
              }))}
            />
            <input
              aria-label="新组织名称"
              value={newOrganizationName}
              maxLength={100}
              onChange={(event) => setNewOrganizationName(event.target.value)}
              className="rounded-lg border border-border px-3 py-2"
              placeholder="新组织名称"
            />
            <button
              type="button"
              disabled={!newOrganizationName.trim()}
              onClick={() => void createOrganization()}
              className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50"
            >
              创建组织
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface-solid p-5">
          <h2 className="font-medium">组织成员</h2>
          {canManage && (
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                aria-label="成员用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="rounded-lg border border-border px-3 py-2"
                placeholder="用户名"
              />
              <Select
                aria-label="组织角色"
                value={role}
                onChange={(event) => setRole(event.target.value as Organization["role"])}
                className="h-10 min-w-32 rounded-lg px-3 py-2"
                options={[
                  { value: "MEMBER", label: "成员" },
                  { value: "ADMIN", label: "管理员" },
                  ...(actorRole === "OWNER"
                    ? [{ value: "OWNER", label: "所有者" }]
                    : []),
                ]}
              />
              <button
                type="button"
                disabled={!username.trim()}
                onClick={() => void addMember()}
                className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50"
              >
                添加成员
              </button>
            </div>
          )}
          <div className="mt-4 divide-y divide-border">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate">{member.username}</span>
                <Select
                  aria-label={`修改 ${member.username} 的角色`}
                  value={member.role}
                  disabled={!canManage || (actorRole !== "OWNER" && member.role === "OWNER")}
                  onChange={(event) => void updateMember(
                    member.id,
                    event.target.value as Organization["role"],
                  )}
                  className="h-9 min-w-28 rounded-lg px-2 py-1.5"
                  options={[
                    { value: "MEMBER", label: "成员" },
                    { value: "ADMIN", label: "管理员" },
                    { value: "OWNER", label: "所有者" },
                  ]}
                />
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void removeMember(member.id)}
                    className="rounded-lg px-3 py-1.5 text-danger hover:bg-danger/10"
                  >
                    移除
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
