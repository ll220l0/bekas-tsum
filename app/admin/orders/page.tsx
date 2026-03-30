"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { Button, Card } from "@/components/ui";
import { formatKgs } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import { getOrderStatusMeta, isApprovedStatus, isHistoryStatus } from "@/lib/orderStatus";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type AdminRole = "owner" | "operator" | "courier";

type AdminOrderItem = {
  id: string;
  title: string;
  qty: number;
  priceKgs: number;
  photoUrl: string;
};

type AdminOrder = {
  id: string;
  status: string;
  totalKgs: number;
  paymentMethod: string;
  payerName: string;
  canceledReason: string;
  customerPhone: string;
  comment: string;
  itemCount: number;
  restaurant: { name: string; slug?: string };
  location: { market?: string; line?: string; container?: string; landmark?: string };
  createdAt: string;
  updatedAt: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
  canceledAt?: string | null;
  items: AdminOrderItem[];
};

type AdminOrdersResponse = { orders: AdminOrder[]; role?: AdminRole; user?: string };
const OLD_BISHKEK = "Олд Бишкек";

function formatLocation(location?: {
  market?: string;
  line?: string;
  container?: string;
  landmark?: string;
}) {
  if (!location) return "Бутик -";

  const isOldBishkek = location.market === OLD_BISHKEK;
  const parts: Array<string> = [];

  if (location.market) parts.push(`Торговый центр ${location.market}`);
  if (!isOldBishkek) parts.push(`Этаж ${location.line || "-"}`);
  parts.push(`Бутик ${location.container || "-"}`);
  if (location.landmark) parts.push(`(${location.landmark})`);

  return parts.join(", ");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось получить заказы";
}

function normalizePhone(phone: string) {
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

function getStatusTone(status: string) {
  if (status === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "canceled") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "created" || status === "pending_confirmation")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function canConfirmByRole(role: AdminRole | null) {
  return role === "owner" || role === "operator";
}

function canCancelByRole(role: AdminRole | null) {
  return role === "owner" || role === "operator";
}

function canDeliverByRole(role: AdminRole | null) {
  return role === "owner" || role === "operator" || role === "courier";
}

function canCancelOrder(status: string) {
  return (
    status === "created" ||
    status === "pending_confirmation" ||
    (isApprovedStatus(status) && status !== "delivered")
  );
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

function getSlaMeta(order: AdminOrder) {
  if (order.status === "delivered" || order.status === "canceled") return null;

  const now = Date.now();
  const created = new Date(order.createdAt).getTime();

  if (order.status === "created" || order.status === "pending_confirmation") {
    const deadline = created + 8 * 60 * 1000;
    const overdue = now > deadline;
    return {
      label: overdue ? "Оплата не подтверждена" : "Подтвердить оплату до",
      value: new Date(deadline).toLocaleTimeString(),
      tail: overdue
        ? `Просрочка ${formatDuration(now - deadline)}`
        : `Осталось ${formatDuration(deadline - now)}`,
      className: overdue
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  const base = order.paymentConfirmedAt ? new Date(order.paymentConfirmedAt).getTime() : created;
  const eta = base + 35 * 60 * 1000;
  const overdue = now > eta;
  return {
    label: overdue ? "Доставка просрочена" : "Доставка до",
    value: new Date(eta).toLocaleTimeString(),
    tail: overdue
      ? `Просрочка ${formatDuration(now - eta)}`
      : `Осталось ${formatDuration(eta - now)}`,
    className: overdue
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

export default function AdminOrdersPage() {
  const [data, setData] = useState<AdminOrdersResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [currentRole, setCurrentRole] = useState<AdminRole | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `Не удалось загрузить заказы (${res.status})`);
      }

      const j = (await res.json()) as AdminOrdersResponse;
      setData(j);
      setCurrentRole(j.role ?? null);
      setLoadError(null);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setLoadError(message);
      if (!silent) toast.error(message);
    }
  }, []);

  useEffect(() => {
    void load();

    const fallbackTimer = window.setInterval(() => {
      void load(true);
    }, 20000);

    let es: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      es = new EventSource("/api/admin/orders/stream");
      es.addEventListener("orders_meta", () => {
        void load(true);
      });
    }

    const onFocus = () => void load(true);
    const onOnline = () => void load(true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearInterval(fallbackTimer);
      if (es) es.close();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [load]);

  async function confirm(id: string) {
    const res = await fetch(`/api/admin/orders/${id}/confirm`, { method: "POST" });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) toast.error(j?.error ?? "Ошибка");
    else toast.success("Оплата подтверждена");
    void load(true);
  }

  async function startCooking(id: string) {
    const res = await fetch(`/api/admin/orders/${id}/cooking`, { method: "POST" });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) toast.error(j?.error ?? "Ошибка");
    else toast.success("Статус: Готовится");
    void load(true);
  }

  async function handToCourier(id: string) {
    const res = await fetch(`/api/admin/orders/${id}/delivering`, { method: "POST" });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) toast.error(j?.error ?? "Ошибка");
    else toast.success("Статус: Передан курьеру");
    void load(true);
  }

  async function deliver(id: string) {
    const res = await fetch(`/api/admin/orders/${id}/deliver`, { method: "POST" });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) toast.error(j?.error ?? "Ошибка");
    else toast.success("Заказ доставлен");
    void load(true);
  }

  function openCancelModal(id: string) {
    setCancelOrderId(id);
    setCancelReason("");
  }

  function closeCancelModal(force = false) {
    if (cancelLoading && !force) return;
    setCancelOrderId(null);
    setCancelReason("");
  }

  async function submitCancelOrder() {
    if (!cancelOrderId) return;
    const reason = cancelReason.trim();
    if (!reason) {
      toast.error("Причина отмены обязательна");
      return;
    }

    setCancelLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${cancelOrderId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(j?.error ?? "Ошибка");
        return;
      }
      toast.success("Заказ отменен");
      closeCancelModal(true);
      await load(true);
    } finally {
      setCancelLoading(false);
    }
  }

  const orders = useMemo(() => data?.orders ?? [], [data?.orders]);
  const activeOrders = useMemo(() => orders.filter((o) => !isHistoryStatus(o.status)), [orders]);
  const historyOrders = useMemo(() => orders.filter((o) => isHistoryStatus(o.status)), [orders]);

  function renderOrderCard(order: AdminOrder) {
    const statusForDisplay = order.status === "created" ? "pending_confirmation" : order.status;
    const statusMeta = getOrderStatusMeta(statusForDisplay);
    const statusTone = getStatusTone(statusForDisplay);
    const normalizedPhone = order.customerPhone ? normalizePhone(order.customerPhone) : "";
    const whatsappHref = normalizedPhone ? buildWhatsAppLink(normalizedPhone) : null;
    const phoneHref = normalizedPhone ? `tel:+${normalizedPhone.replace(/^\+/, "")}` : null;
    const sla = getSlaMeta(order);

    return (
      <Card
        key={order.id}
        className="motion-fade-up overflow-hidden border border-black/10 bg-white/90 p-0 shadow-[0_14px_35px_rgba(15,23,42,0.12)]"
      >
        <div className="border-b border-black/10 bg-white/85 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
                Заказ #{order.id.slice(-6)}
              </div>
              <div className="mt-1 text-base font-bold text-black/90">
                {order.restaurant?.name ?? "-"}
              </div>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}
            >
              {statusMeta.label}
            </span>
          </div>
          <div className="mt-2 text-xs text-black/50">
            Обновлен: {new Date(order.updatedAt).toLocaleString()}
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          {sla && (
            <div className={`rounded-2xl border px-3 py-2 text-sm ${sla.className}`}>
              <div className="font-semibold">
                {sla.label}: {sla.value}
              </div>
              <div className="text-xs opacity-85">{sla.tail}</div>
            </div>
          )}

          <div className="rounded-2xl border border-black/10 bg-slate-50/80 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
                  Плательщик
                </div>
                <div className="mt-1 text-base font-bold text-black/90">
                  {order.payerName || "НЕ УКАЗАН"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
                  Сумма
                </div>
                <div className="mt-1 text-lg font-extrabold text-black/90">
                  {formatKgs(order.totalKgs)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-2xl border border-black/10 bg-white p-3 text-sm">
            <div className="text-black/55">Метод оплаты</div>
            <div className="text-right font-semibold text-black/85">
              {paymentMethodLabel(order.paymentMethod)}
            </div>
            <div className="text-black/55">Телефон</div>
            <div className="text-right font-semibold text-black/85">
              {order.customerPhone || "-"}
            </div>
            <div className="text-black/55">Создан</div>
            <div className="text-right text-black/75">
              {new Date(order.createdAt).toLocaleString()}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-3 text-sm text-black/75">
            {formatLocation(order.location)}
          </div>

          {order.comment ? (
            <div className="rounded-2xl border border-black/10 bg-white p-3 text-sm text-black/75">
              Комментарий: {order.comment}
            </div>
          ) : null}
          {order.status === "canceled" && order.canceledReason ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Причина отмены: {order.canceledReason}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {(order.status === "created" || order.status === "pending_confirmation") &&
              canConfirmByRole(currentRole) && (
                <Button onClick={() => void confirm(order.id)} className="h-10 px-4">
                  Подтвердить оплату
                </Button>
              )}
            {order.status === "confirmed" && canConfirmByRole(currentRole) && (
              <Button
                onClick={() => void startCooking(order.id)}
                variant="secondary"
                className="h-10 px-4"
              >
                Готовится
              </Button>
            )}
            {order.status === "cooking" && canDeliverByRole(currentRole) && (
              <Button
                onClick={() => void handToCourier(order.id)}
                variant="secondary"
                className="h-10 px-4"
              >
                Передан курьеру
              </Button>
            )}
            {order.status === "delivering" && canDeliverByRole(currentRole) && (
              <Button
                onClick={() => void deliver(order.id)}
                variant="secondary"
                className="h-10 px-4"
              >
                Подтвердить доставку
              </Button>
            )}
            {canCancelOrder(order.status) && canCancelByRole(currentRole) && (
              <Button
                onClick={() => openCancelModal(order.id)}
                variant="secondary"
                className="h-10 border-rose-300 bg-rose-50 px-4 text-rose-700"
              >
                Отменить заказ
              </Button>
            )}
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                aria-label="Написать в WhatsApp"
                title="WhatsApp"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-white transition hover:bg-emerald-50"
              >
                <svg
                  fill="#3ec11a"
                  version="1.1"
                  viewBox="0 0 30.667 30.667"
                  stroke="#3ec11a"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <g>
                    <path d="M30.667,14.939c0,8.25-6.74,14.938-15.056,14.938c-2.639,0-5.118-0.675-7.276-1.857L0,30.667l2.717-8.017 c-1.37-2.25-2.159-4.892-2.159-7.712C0.559,6.688,7.297,0,15.613,0C23.928,0.002,30.667,6.689,30.667,14.939z M15.61,2.382 c-6.979,0-12.656,5.634-12.656,12.56c0,2.748,0.896,5.292,2.411,7.362l-1.58,4.663l4.862-1.545c2,1.312,4.393,2.076,6.963,2.076 c6.979,0,12.658-5.633,12.658-12.559C28.27,8.016,22.59,2.382,15.61,2.382z M23.214,18.38c-0.094-0.151-0.34-0.243-0.708-0.427 c-0.367-0.184-2.184-1.069-2.521-1.189c-0.34-0.123-0.586-0.185-0.832,0.182c-0.243,0.367-0.951,1.191-1.168,1.437 c-0.215,0.245-0.43,0.276-0.799,0.095c-0.369-0.186-1.559-0.57-2.969-1.817c-1.097-0.972-1.838-2.169-2.052-2.536 c-0.217-0.366-0.022-0.564,0.161-0.746c0.165-0.165,0.369-0.428,0.554-0.643c0.185-0.213,0.246-0.364,0.369-0.609 c0.121-0.245,0.06-0.458-0.031-0.643c-0.092-0.184-0.829-1.984-1.138-2.717c-0.307-0.732-0.614-0.611-0.83-0.611 c-0.215,0-0.461-0.03-0.707-0.03S9.897,8.215,9.56,8.582s-1.291,1.252-1.291,3.054c0,1.804,1.321,3.543,1.506,3.787 c0.186,0.243,2.554,4.062,6.305,5.528c3.753,1.465,3.753,0.976,4.429,0.914c0.678-0.062,2.184-0.885,2.49-1.739 C23.307,19.268,23.307,18.533,23.214,18.38z"></path>
                  </g>
                </svg>
              </a>
            )}
            {phoneHref && (
              <a
                href={phoneHref}
                aria-label="Позвонить"
                title="Позвонить"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-black text-white transition hover:bg-black/85"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                  <path
                    d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.43.57 3.57a1 1 0 0 1-.24 1.02l-2.2 2.2Z"
                    fill="currentColor"
                  />
                </svg>
              </a>
            )}
          </div>

          <div className="space-y-2 border-t border-black/10 pt-3">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-2 py-2"
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/5 ring-1 ring-black/5">
                  <Image
                    src={item.photoUrl}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="44px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-black/90">{item.title}</div>
                  <div className="text-xs text-black/55">
                    {item.qty} x {formatKgs(item.priceKgs)}
                  </div>
                </div>
                <div className="text-sm font-bold text-black/90">
                  {formatKgs(item.priceKgs * item.qty)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-black/50">Админка</div>
            <div className="text-3xl font-extrabold">Заказы</div>
            <div className="mt-1 text-xs text-black/55">Роль: {currentRole ?? "-"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="text-sm text-black/60 underline" href="/admin">
              Назад
            </Link>
            <AdminLogoutButton className="px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-6">
          {loadError && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {loadError}
            </div>
          )}
          <div className="mb-3 text-sm font-semibold text-black/65">
            Активные ({activeOrders.length})
          </div>
          <div className="space-y-3">{activeOrders.map((order) => renderOrderCard(order))}</div>
        </div>

        <div className="mt-8">
          <div className="mb-3 text-sm font-semibold text-black/65">
            История ({historyOrders.length})
          </div>
          <div className="space-y-3">{historyOrders.map((order) => renderOrderCard(order))}</div>
        </div>
      </div>

      {cancelOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            aria-label="Закрыть окно причины отмены"
            onClick={() => closeCancelModal()}
          />
          <Card className="motion-pop relative z-10 w-full max-w-md p-4">
            <div className="text-lg font-extrabold">Причина отмены</div>
            <div className="mt-1 text-sm text-black/60">
              Укажите причину, она будет видна в истории заказа.
            </div>
            <textarea
              className="mt-3 h-28 w-full resize-none rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/25"
              placeholder="Например: клиент попросил отмену"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelLoading}
            />
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => closeCancelModal()}
                disabled={cancelLoading}
              >
                Отмена
              </Button>
              <Button
                className="flex-1"
                onClick={() => void submitCancelOrder()}
                disabled={cancelLoading}
              >
                {cancelLoading ? "Сохраняем..." : "Подтвердить"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
