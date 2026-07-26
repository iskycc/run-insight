"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/shared/Input";
import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/contexts/ToastContext";
import { formatDateTime } from "@/lib/date-time";
import { ApiError, fetchJson } from "@/lib/fetch";
import type {
  WebhookDeliveriesResponse,
  WebhookDeliveryDTO,
  WebhookEndpointCreateResponse,
  WebhookEndpointDTO,
  WebhookEndpointsResponse,
  WebhookEventType,
} from "@/types";

const EVENT_LABELS: Record<WebhookEventType, string> = {
  IMPORT_COMPLETED: "导入完成",
  IMPORT_FAILED: "导入失败",
  QUALITY_GATE_FAILED: "质量门禁失败",
  REPORT_GENERATED: "报告生成",
};

const ALL_EVENTS = Object.keys(EVENT_LABELS) as WebhookEventType[];

export function WebhookSettings({
  projectId,
  canAdmin,
  archived,
}: {
  projectId: string;
  canAdmin: boolean;
  archived: boolean;
}) {
  const { showToast } = useToast();
  const [webhooks, setWebhooks] = useState<WebhookEndpointDTO[]>([]);
  const [loading, setLoading] = useState(canAdmin);
  const [reload, setReload] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [active, setActive] = useState(true);
  const [events, setEvents] = useState<WebhookEventType[]>([
    "IMPORT_COMPLETED",
    "IMPORT_FAILED",
  ]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [issuedSecret, setIssuedSecret] = useState("");
  const [selected, setSelected] = useState<WebhookEndpointDTO | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryDTO[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  useEffect(() => {
    if (!canAdmin) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await fetchJson<WebhookEndpointsResponse>(
          `/api/projects/${projectId}/webhooks`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setWebhooks(Array.isArray(result.webhooks) ? result.webhooks : []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          showToast({
            type: "error",
            message:
              error instanceof ApiError ? error.message : "加载 Webhook 失败",
          });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [canAdmin, projectId, reload, showToast]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setUrl("");
    setActive(true);
    setEvents(["IMPORT_COMPLETED", "IMPORT_FAILED"]);
    setFormError("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((webhook: WebhookEndpointDTO) => {
    setEditingId(webhook.id);
    setUrl(webhook.url);
    setActive(webhook.active);
    setEvents(webhook.events);
    setFormError("");
    setModalOpen(true);
  }, []);

  const save = useCallback(async () => {
    if (!url.trim().startsWith("https://")) {
      setFormError("请输入有效的 HTTPS URL");
      return;
    }
    if (events.length === 0) {
      setFormError("至少选择一个事件");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (editingId) {
        await fetchJson(`/api/projects/${projectId}/webhooks/${editingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: url.trim(), active, events }),
        });
        showToast({ type: "success", message: "Webhook 已更新" });
      } else {
        const result = await fetchJson<WebhookEndpointCreateResponse>(
          `/api/projects/${projectId}/webhooks`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: url.trim(), active, events }),
          },
        );
        setIssuedSecret(result.secret);
        showToast({ type: "success", message: "Webhook 已创建" });
      }
      setModalOpen(false);
      setReload((value) => value + 1);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [active, editingId, events, projectId, showToast, url]);

  const toggle = useCallback(
    async (webhook: WebhookEndpointDTO) => {
      try {
        await fetchJson(
          `/api/projects/${projectId}/webhooks/${webhook.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ active: !webhook.active }),
          },
        );
        setReload((value) => value + 1);
      } catch (error) {
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "更新失败",
        });
      }
    },
    [projectId, showToast],
  );

  const rotate = useCallback(
    async (webhook: WebhookEndpointDTO) => {
      if (!window.confirm("轮换后旧密钥立即失效，确定继续吗？")) return;
      try {
        const result = await fetchJson<{ secret: string }>(
          `/api/projects/${projectId}/webhooks/${webhook.id}/rotate-secret`,
          { method: "POST" },
        );
        setIssuedSecret(result.secret);
        setReload((value) => value + 1);
      } catch (error) {
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "轮换失败",
        });
      }
    },
    [projectId, showToast],
  );

  const remove = useCallback(
    async (webhook: WebhookEndpointDTO) => {
      if (!window.confirm("确定删除该 Webhook 吗？投递历史将保留。")) return;
      try {
        await fetchJson(`/api/projects/${projectId}/webhooks/${webhook.id}`, {
          method: "DELETE",
        });
        if (selected?.id === webhook.id) setSelected(null);
        setReload((value) => value + 1);
      } catch (error) {
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "删除失败",
        });
      }
    },
    [projectId, selected, showToast],
  );

  const loadDeliveries = useCallback(
    async (webhook: WebhookEndpointDTO) => {
      setSelected(webhook);
      setDeliveriesLoading(true);
      try {
        const result = await fetchJson<WebhookDeliveriesResponse>(
          `/api/projects/${projectId}/webhooks/${webhook.id}/deliveries`,
        );
        setDeliveries(result.deliveries);
      } catch (error) {
        showToast({
          type: "error",
          message:
            error instanceof ApiError ? error.message : "加载投递记录失败",
        });
      } finally {
        setDeliveriesLoading(false);
      }
    },
    [projectId, showToast],
  );

  const retry = useCallback(
    async (delivery: WebhookDeliveryDTO) => {
      if (!selected) return;
      try {
        await fetchJson(
          `/api/projects/${projectId}/webhooks/${selected.id}/deliveries/${delivery.id}/retry`,
          { method: "POST" },
        );
        showToast({ type: "success", message: "已重新加入投递队列" });
        await loadDeliveries(selected);
      } catch (error) {
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "重试失败",
        });
      }
    },
    [loadDeliveries, projectId, selected, showToast],
  );

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">出站 Webhook</h2>
          <p className="mt-1 text-xs text-text-secondary">
            使用 HMAC-SHA256 签名向外部 HTTPS 服务发送项目事件。
          </p>
        </div>
        {canAdmin && (
          <Button onClick={openCreate} disabled={archived}>
            创建 Webhook
          </Button>
        )}
      </div>

      {!canAdmin ? (
        <p className="mt-4 text-sm text-text-secondary">
          Webhook 管理仅对项目管理员开放
        </p>
      ) : loading ? (
        <p className="mt-4 text-sm text-text-secondary">加载中...</p>
      ) : webhooks.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="暂无 Webhook"
            description="创建 Webhook，把导入、质量门禁和报告事件发送给外部系统"
            actionLabel={archived ? undefined : "创建 Webhook"}
            onAction={archived ? undefined : openCreate}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="rounded-2xl border border-border bg-white/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge progress={webhook.active ? "fixed" : "pending"}>
                      {webhook.active ? "已启用" : "已停用"}
                    </Badge>
                    <code className="truncate text-xs text-text-secondary">
                      {webhook.url}
                    </code>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {webhook.events.map((event) => (
                      <Badge key={event}>{EVENT_LABELS[event]}</Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    密钥 {webhook.secretPrefix}•••• · 更新于{" "}
                    {formatDateTime(webhook.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => loadDeliveries(webhook)}>
                    投递记录
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(webhook)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => toggle(webhook)}>
                    {webhook.active ? "停用" : "启用"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => rotate(webhook)}>
                    轮换密钥
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(webhook)}>
                    删除
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-text-primary">
            最近投递记录
          </h3>
          {deliveriesLoading ? (
            <p className="mt-3 text-sm text-text-secondary">加载中...</p>
          ) : deliveries.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">暂无投递记录</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-text-secondary">
                  <tr>
                    <th className="py-2 pr-3">事件</th>
                    <th className="py-2 pr-3">状态</th>
                    <th className="py-2 pr-3">尝试</th>
                    <th className="py-2 pr-3">响应</th>
                    <th className="py-2 pr-3">时间</th>
                    <th className="py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deliveries.map((delivery) => (
                    <tr key={delivery.id}>
                      <td className="py-2 pr-3">{EVENT_LABELS[delivery.event]}</td>
                      <td className="py-2 pr-3">{delivery.status}</td>
                      <td className="py-2 pr-3">
                        {delivery.attempts}/{delivery.maxAttempts}
                      </td>
                      <td className="py-2 pr-3">
                        {delivery.responseStatus ?? delivery.errorCode ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {formatDateTime(delivery.createdAt)}
                      </td>
                      <td className="py-2 text-right">
                        {delivery.status === "FAILED" && (
                          <Button size="sm" variant="secondary" onClick={() => retry(delivery)}>
                            重试
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "编辑 Webhook" : "创建 Webhook"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="HTTPS URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/hooks/run-insight"
            error={formError}
          />
          <fieldset>
            <legend className="text-sm font-medium text-text-primary">订阅事件</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {ALL_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={events.includes(event)}
                    onChange={(change) =>
                      setEvents((current) =>
                        change.target.checked
                          ? [...current, event]
                          : current.filter((item) => item !== event),
                      )
                    }
                  />
                  {EVENT_LABELS[event]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            创建后立即启用
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(issuedSecret)}
        onClose={() => setIssuedSecret("")}
        title="Webhook 签名密钥"
        footer={<Button onClick={() => setIssuedSecret("")}>我已保存，关闭</Button>}
      >
        <p className="text-sm text-text-secondary">
          密钥仅显示一次。请立即保存，并使用它验证
          <code className="mx-1">webhook-signature</code>。
        </p>
        <pre
          data-testid="issued-webhook-secret"
          className="mt-3 overflow-x-auto rounded-xl border border-border bg-bg/60 p-3 font-mono text-xs"
        >
          {issuedSecret}
        </pre>
      </Modal>
    </div>
  );
}
