"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { Button, Card, Photo } from "@/components/ui";
import { formatKgs } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import { getOrderStatusMeta, isApprovedStatus } from "@/lib/orderStatus";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type AdminRole = "owner" | "operator" | "courier";

type OrderItem = {
  id: string;
  title: string;
  qty: number;
  priceKgs: number;
  photoUrl: string;
};

type AdminOrderData = {
  id: string;
  status: string;
  totalKgs: number;
  paymentMethod: string;
  payerName: string;
  canceledReason: string;
  customerPhone: string;
  comment: string;
  location: { market?: string; line?: string; container?: string; landmark?: string };
  createdAt: string;
  updatedAt: string;
  paymentConfirmedAt?: string | null;
  role?: AdminRole;
  user?: string;
  restaurant: { name: string; slug: string };
  items: OrderItem[];
};

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

function normalizePhone(phone: string) {
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
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

function canCancelOrder(status: string | undefined) {
  if (!status) return false;
  return (
    status === "created" ||
    status === "pending_confirmation" ||
    (isApprovedStatus(status) && status !== "delivered")
  );
}

export default function AdminOrderScreen({ orderId }: { orderId: string }) {
  const [data, setData] = useState<AdminOrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [role, setRole] = useState<AdminRole | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/${orderId}`, { cache: "no-store" });
    if (!res.ok) {
      const errorPayload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(errorPayload?.error ?? "Не удалось загрузить заказ");
    }

    const payload = (await res.json().catch(() => null)) as AdminOrderData | null;
    if (!payload) throw new Error("Не удалось загрузить заказ");
    setData(payload);
    setRole(payload.role ?? null);
  }, [orderId]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    });

    const focusReload = () => void load();
    window.addEventListener("focus", focusReload);

    return () => {
      window.removeEventListener("focus", focusReload);
    };
  }, [load]);

  async function confirm() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/confirm`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Операция не выполнена");
      toast.success("Оплата подтверждена");
      void load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function startCooking() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cooking`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Операция не выполнена");
      toast.success("Статус: Готовится");
      void load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handToCourier() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/delivering`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Операция не выполнена");
      toast.success("Статус: Передан курьеру");
      void load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function deliver() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/deliver`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Операция не выполнена");
      toast.success("Заказ отмечен как доставленный");
      void load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function openCancelModal() {
    setCancelReason("");
    setCancelModalOpen(true);
  }

  function closeCancelModal(force = false) {
    if (loading && !force) return;
    setCancelModalOpen(false);
    setCancelReason("");
  }

  async function cancelOrder() {
    const reason = cancelReason.trim();
    if (!reason) {
      toast.error("Причина отмены обязательна");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Операция не выполнена");
      toast.success("Заказ отменен");
      closeCancelModal(true);
      void load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const statusMeta = useMemo(() => {
    const statusForDisplay =
      data?.status === "created" ? "pending_confirmation" : (data?.status ?? "");
    return getOrderStatusMeta(statusForDisplay);
  }, [data?.status]);
  const normalizedPhone = data?.customerPhone ? normalizePhone(data.customerPhone) : "";
  const whatsappHref = normalizedPhone ? buildWhatsAppLink(normalizedPhone) : null;
  const phoneHref = normalizedPhone ? `tel:+${normalizedPhone.replace(/^\+/, "")}` : null;

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-black/50">Админка</div>
            <div className="text-3xl font-extrabold">Заказ #{orderId.slice(-6)}</div>
            <div className="mt-1 text-xs text-black/55">Роль: {role ?? "-"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="text-sm text-black/60 underline" href="/admin/orders">
              Назад к заказам
            </Link>
            <AdminLogoutButton className="px-3 py-2 text-sm" />
          </div>
        </div>

        <Card className="motion-fade-up mt-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">{data?.restaurant?.name ?? "..."}</div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusMeta.badgeClassName}`}
            >
              {statusMeta.label}
            </span>
          </div>

          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Плательщик
            </div>
            <div className="mt-1 text-lg font-extrabold text-emerald-900">
              {data?.payerName || "НЕ УКАЗАН"}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="text-black/60">Сумма</div>
            <div className="text-right font-bold">{formatKgs(data?.totalKgs ?? 0)}</div>
            <div className="text-black/60">Метод оплаты</div>
            <div className="text-right">{paymentMethodLabel(data?.paymentMethod ?? "")}</div>
            <div className="text-black/60">Телефон</div>
            <div className="text-right">{data?.customerPhone || "-"}</div>
            <div className="text-black/60">Создан</div>
            <div className="text-right">
              {data ? new Date(data.createdAt).toLocaleString() : "-"}
            </div>
            <div className="text-black/60">Обновлен</div>
            <div className="text-right">
              {data ? new Date(data.updatedAt).toLocaleString() : "-"}
            </div>
          </div>

          <div className="mt-3 text-sm text-black/70">{formatLocation(data?.location)}</div>
          {data?.comment ? (
            <div className="mt-1 text-sm text-black/70">Комментарий: {data.comment}</div>
          ) : null}
          {data?.status === "canceled" && data?.canceledReason ? (
            <div className="mt-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Причина отмены: {data.canceledReason}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {(data?.status === "created" || data?.status === "pending_confirmation") &&
              canConfirmByRole(role) && (
                <Button disabled={loading} onClick={() => void confirm()}>
                  Подтвердить оплату
                </Button>
              )}
            {data?.status === "confirmed" && canConfirmByRole(role) && (
              <Button disabled={loading} onClick={() => void startCooking()} variant="secondary">
                Готовится
              </Button>
            )}
            {data?.status === "cooking" && canDeliverByRole(role) && (
              <Button disabled={loading} onClick={() => void handToCourier()} variant="secondary">
                Передан курьеру
              </Button>
            )}
            {data?.status === "delivering" && canDeliverByRole(role) && (
              <Button disabled={loading} onClick={() => void deliver()} variant="secondary">
                Подтвердить доставку
              </Button>
            )}
            {canCancelOrder(data?.status) && canCancelByRole(role) && (
              <Button
                disabled={loading}
                onClick={openCancelModal}
                variant="secondary"
                className="border-rose-300 bg-rose-50 text-rose-700"
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
        </Card>

        <div className="mt-4 space-y-3">
          {(data?.items ?? []).map((item) => (
            <Card key={item.id} className="motion-fade-up p-3">
              <div className="flex gap-3">
                <Photo src={item.photoUrl} alt={item.title} />
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{item.title}</div>
                    <div className="font-bold">{formatKgs(item.priceKgs * item.qty)}</div>
                  </div>
                  <div className="mt-1 text-sm text-black/55">
                    {item.qty} x {formatKgs(item.priceKgs)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {cancelModalOpen && (
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
              disabled={loading}
            />
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => closeCancelModal()}
                disabled={loading}
              >
                Отмена
              </Button>
              <Button className="flex-1" onClick={() => void cancelOrder()} disabled={loading}>
                {loading ? "Сохраняем..." : "Подтвердить"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
