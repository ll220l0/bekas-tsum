"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Photo } from "@/components/ui";
import { ClientNav } from "@/components/ClientNav";
import {
  clearActiveOrderId,
  clearPendingPayOrderId,
  getActiveOrderId,
  getLastOrderId,
  getOrderHistory,
  getPendingPayOrderId,
  getSavedPhone,
  setActiveOrderId,
  setPendingPayOrderId
} from "@/lib/clientPrefs";
import { formatKgs } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import { getOrderStatusMeta, isApprovedStatus, isHistoryStatus, isPendingConfirmation } from "@/lib/orderStatus";

type OrderItem = {
  id: string;
  menuItemId?: string;
  title: string;
  qty: number;
  priceKgs: number;
  photoUrl: string;
};

type OrderData = {
  id: string;
  status: string;
  paymentMethod: string;
  totalKgs: number;
  payerName?: string;
  comment?: string;
  customerPhone?: string;
  location?: { line?: string; container?: string; landmark?: string };
  restaurant?: { name?: string; slug?: string };
  createdAt: string;
  updatedAt: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
  canceledAt?: string | null;
  items: OrderItem[];
};

type HistoryOrder = {
  id: string;
  status: string;
  paymentMethod: string;
  totalKgs: number;
  payerName?: string;
  comment?: string;
  customerPhone?: string;
  location?: { line?: string; container?: string; landmark?: string };
  restaurant?: { name?: string; slug?: string };
  createdAt: string;
  updatedAt: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
  canceledAt?: string | null;
  items: OrderItem[];
};

const DELIVERY_WAIT_STATUSES = new Set(["confirmed", "cooking", "delivering"]);
const CANCEL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCross({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconAlert({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 7V13" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.35" />
    </svg>
  );
}

function IconChevron({ open, className = "h-3.5 w-3.5" }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`${className} transition-transform ${open ? "rotate-180" : "rotate-0"}`}
      aria-hidden="true"
    >
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHistory({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.3-5.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 4v3.8h3.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8.5v4l2.8 1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CancelTimer({ createdAt }: { createdAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const created = new Date(createdAt).getTime();
    const tick = () => {
      const diff = created + CANCEL_WINDOW_MS - Date.now();
      setRemaining(diff > 0 ? diff : 0);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [createdAt]);

  if (remaining === null) return null;

  if (remaining <= 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-500">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Время на отмену истекло
      </div>
    );
  }

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-700">
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Можно отменить ещё {timeStr}
    </div>
  );
}

function PushSubscribeButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"idle" | "subscribed" | "unsupported" | "loading">("idle");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
    }
  }, []);

  const subscribe = async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) { setState("unsupported"); return; }

    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState("idle"); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, subscription: sub.toJSON() })
      });

      setState("subscribed");
    } catch {
      setState("idle");
    }
  };

  if (state === "unsupported" || state === "subscribed") {
    return state === "subscribed" ? (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-700">
        🔔 Уведомления включены
      </div>
    ) : null;
  }

  return (
    <button
      onClick={() => void subscribe()}
      disabled={state === "loading"}
      className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:bg-white hover:shadow-md disabled:opacity-50"
    >
      {state === "loading" ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border border-slate-400 border-t-transparent" />
      ) : (
        "🔔"
      )}
      Уведомить меня об изменениях
    </button>
  );
}

function StatusProgress({ status }: { status: string }) {
  if (isPendingConfirmation(status)) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <div className="text-sm font-semibold text-amber-700">Ожидаем подтверждения заказа</div>
      </div>
    );
  }

  if (status === "delivered") {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
          <IconCheck />
        </div>
        <div className="text-sm font-semibold text-emerald-700">Спасибо за выбор. Заказ доставлен.</div>
      </div>
    );
  }

  if (isApprovedStatus(status)) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
          <IconCheck />
        </div>
        <div className="text-sm font-semibold text-emerald-700">Заказ подтвержден</div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white">
        <IconAlert />
      </div>
      <div className="text-sm font-semibold text-rose-700">Заказ отменен</div>
    </div>
  );
}

function parseIsoDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatEtaText(date: Date | null) {
  if (!date) return "ETA уточняется";
  const now = Date.now();
  const diffMs = date.getTime() - now;
  if (diffMs <= 0) {
    return `Плановое время: ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `Примерно через ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `Примерно через ${hours} ч ${remainMinutes} мин`;
}

function resolveDeliveryEta({
  status,
  createdAt,
  paymentConfirmedAt,
  deliveredAt
}: {
  status: string;
  createdAt?: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
}) {
  const created = parseIsoDate(createdAt ?? null);
  const paymentConfirmed = parseIsoDate(paymentConfirmedAt ?? null);
  const delivered = parseIsoDate(deliveredAt ?? null);

  if (status === "delivered") return delivered;
  if (!created) return null;

  const base = paymentConfirmed ?? created;
  if (status === "confirmed") return new Date(base.getTime() + 35 * 60_000);
  if (status === "cooking") return new Date(base.getTime() + 22 * 60_000);
  if (status === "delivering") return new Date(base.getTime() + 10 * 60_000);
  if (status === "created" || status === "pending_confirmation") return new Date(created.getTime() + 45 * 60_000);
  return null;
}

const DELIVERY_STEPS = ["Подтвержден", "Готовится", "Передан курьеру", "Доставлен"] as const;

function currentDeliveryStep(status: string) {
  if (status === "confirmed") return 0;
  if (status === "cooking") return 1;
  if (status === "delivering") return 2;
  if (status === "delivered") return 3;
  return -1;
}

function DeliveryTracker({
  status,
  createdAt,
  paymentConfirmedAt,
  deliveredAt
}: {
  status: string;
  createdAt?: string;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
}) {
  if (status === "canceled") return null;

  const activeStep = currentDeliveryStep(status);
  const eta = resolveDeliveryEta({ status, createdAt, paymentConfirmedAt, deliveredAt });

  if (activeStep < 0) {
    return (
      <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/60 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Этапы доставки</div>
        <div className="mt-1 text-sm font-semibold text-slate-700">Ожидаем подтверждения оплаты</div>
        <div className="mt-1 text-xs text-slate-500">{formatEtaText(eta)}</div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Этапы доставки</div>
      <div className="mt-2 space-y-2">
        {DELIVERY_STEPS.map((step, index) => {
          const done = index < activeStep || status === "delivered";
          const current = index === activeStep && status !== "delivered";

          return (
            <div key={step} className="flex items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  done
                    ? "bg-emerald-600 text-white"
                    : current
                      ? "bg-sky-500 text-white shadow-[0_0_0_5px_rgba(14,165,233,0.16)]"
                      : "bg-white text-slate-500 ring-1 ring-slate-200"
                }`}
              >
                {done ? <IconCheck className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={`text-sm ${done || current ? "font-semibold text-slate-800" : "text-slate-400"}`}>{step}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-slate-500">{status === "delivered" ? "Заказ доставлен" : `ETA: ${formatEtaText(eta)}`}</div>
    </div>
  );
}

function historyStatusIcon(status: string) {
  if (status === "delivered") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <IconCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "canceled") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700">
        <IconCross className="h-3.5 w-3.5" />
      </span>
    );
  }
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">•</span>;
}

export default function OrderScreen({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderData | null>(null);
  const [orderMissing, setOrderMissing] = useState(false);
  const [orderLoading, setOrderLoading] = useState(true);
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderHref, setOrderHref] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openedHistoryOrderId, setOpenedHistoryOrderId] = useState<string | null>(null);
  const [showDeliveredFx, setShowDeliveredFx] = useState(false);
  const [showCanceledFx, setShowCanceledFx] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  const loadOrder = useCallback(
    async (silent = false) => {
      if (!silent) setOrderLoading(true);
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (res.status === 404) {
          setData(null);
          setOrderMissing(true);
          return;
        }
        if (!res.ok) return;
        const j = (await res.json()) as OrderData;
        setData(j);
        setOrderMissing(false);
      } finally {
        if (!silent) setOrderLoading(false);
      }
    },
    [orderId]
  );

  const loadHistory = useCallback(async () => {
    const ids = getOrderHistory()
      .map((entry) => entry.orderId)
      .filter(Boolean);
    const phone = getSavedPhone().replace(/\D/g, "").trim();

    if (ids.length === 0 && phone.length < 7) {
      setHistory([]);
      return;
    }

    const params = new URLSearchParams();
    if (ids.length > 0) params.set("ids", ids.slice(0, 30).join(","));
    if (phone.length >= 7) params.set("phone", phone);

    const res = await fetch(`/api/orders/history?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setHistory([]);
      return;
    }

    const j = (await res.json()) as { orders: HistoryOrder[] };
    setHistory((j.orders ?? []).filter((order) => isHistoryStatus(order.status)));
  }, []);

  useEffect(() => {
    const pendingPayOrderId = getPendingPayOrderId();
    if (pendingPayOrderId) {
      setLastOrderId(pendingPayOrderId);
      setOrderHref(`/pay/${pendingPayOrderId}`);
      return;
    }
    const activeOrderId = getActiveOrderId();
    if (activeOrderId) {
      setLastOrderId(activeOrderId);
      setOrderHref(`/order/${activeOrderId}`);
      return;
    }
    const lastOrderIdValue = getLastOrderId();
    setLastOrderId(lastOrderIdValue);
    setOrderHref(lastOrderIdValue ? `/order/${lastOrderIdValue}` : null);
  }, []);

  useEffect(() => { void loadOrder(); }, [loadOrder]);
  useEffect(() => { void loadHistory(); }, [loadHistory, data?.status]);

  useEffect(() => {
    if (!data?.id) return;
    const isBankPayment = data.paymentMethod === "bank";
    const isPendingPayStatus = data.status === "created" || data.status === "pending_confirmation";

    if (isBankPayment && isPendingPayStatus) {
      setPendingPayOrderId(data.id);
      setActiveOrderId(data.id);
      setLastOrderId(data.id);
      setOrderHref(`/pay/${data.id}`);
      return;
    }

    clearPendingPayOrderId(data.id);
    if (isHistoryStatus(data.status)) {
      clearActiveOrderId(data.id);
    } else {
      setActiveOrderId(data.id);
    }
    setLastOrderId(data.id);
    setOrderHref(`/order/${data.id}`);
  }, [data?.id, data?.paymentMethod, data?.status]);

  useEffect(() => {
    const status = data?.status;
    if (!status) return;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!prevStatus) return;

    if (status === "delivered" && prevStatus !== "delivered") {
      setShowDeliveredFx(true);
      const timer = setTimeout(() => setShowDeliveredFx(false), 2400);
      return () => clearTimeout(timer);
    }
    if (status === "canceled" && DELIVERY_WAIT_STATUSES.has(prevStatus)) {
      setShowCanceledFx(true);
      const timer = setTimeout(() => setShowCanceledFx(false), 2400);
      return () => clearTimeout(timer);
    }
  }, [data?.status]);

  useEffect(() => {
    const fallbackTimer = setInterval(() => void loadOrder(true), 5000);

    let es: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      es = new EventSource(`/api/orders/${orderId}/stream`);
      es.addEventListener("snapshot", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            order?: { id: string; status: string; updatedAt: string } | null;
          };
          if (payload?.order) {
            setOrderMissing(false);
            setData((prev) => {
              if (!prev || prev.id !== payload.order?.id) return prev;
              return { ...prev, status: payload.order.status, updatedAt: payload.order.updatedAt };
            });
            void loadOrder(true);
          } else {
            setData(null);
            setOrderMissing(true);
          }
        } catch { /* ignore */ }
      });
      es.onerror = () => { /* fallbackTimer keeps data fresh */ };
    }

    return () => {
      clearInterval(fallbackTimer);
      if (es) es.close();
    };
  }, [loadOrder, orderId]);

  const statusMeta = useMemo(() => getOrderStatusMeta(data?.status ?? ""), [data?.status]);
  const menuSlug = data?.restaurant?.slug ?? history[0]?.restaurant?.slug ?? "dordoi-food";
  const isArchived = isHistoryStatus(data?.status ?? "");
  const hasNoActiveOrder = !orderLoading && (orderMissing || !data);
  const canCancel = data && !isHistoryStatus(data.status) &&
    (Date.now() - new Date(data.createdAt).getTime()) < CANCEL_WINDOW_MS;

  return (
    <main className="min-h-screen px-4 pb-52 pt-4">
      {/* Delivered FX */}
      {showDeliveredFx && (
        <div className="delivered-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="delivered-card relative w-full max-w-sm overflow-hidden rounded-[28px] border border-emerald-200/80 bg-white/90 p-7 text-center shadow-[0_24px_70px_-24px_rgba(16,185,129,0.65)] backdrop-blur-xl">
            <div className="relative mx-auto h-24 w-24">
              <div className="delivered-check-ring absolute inset-0 rounded-full border-4 border-emerald-300/70" />
              <div className="delivered-check-core absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_12px_30px_-12px_rgba(5,150,105,0.85)]">
                <IconCheck className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 text-[24px] font-extrabold leading-tight text-emerald-700">Заказ доставлен</div>
            <div className="mt-1 text-sm font-semibold text-emerald-700/75">Приятного аппетита!</div>
            <span className="delivered-dot delivered-dot-1" />
            <span className="delivered-dot delivered-dot-2" />
            <span className="delivered-dot delivered-dot-3" />
            <span className="delivered-dot delivered-dot-4" />
            <span className="delivered-dot delivered-dot-5" />
            <span className="delivered-dot delivered-dot-6" />
          </div>
        </div>
      )}

      {/* Canceled FX */}
      {showCanceledFx && (
        <div className="canceled-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="canceled-card relative w-full max-w-sm overflow-hidden rounded-[28px] border border-rose-200/80 bg-white/90 p-7 text-center shadow-[0_24px_70px_-24px_rgba(244,63,94,0.62)] backdrop-blur-xl">
            <div className="relative mx-auto h-24 w-24">
              <div className="canceled-cross-ring absolute inset-0 rounded-full border-4 border-rose-300/75" />
              <div className="canceled-cross-core absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_12px_30px_-12px_rgba(225,29,72,0.8)]">
                <IconCross className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 text-[24px] font-extrabold leading-tight text-rose-700">Заказ отменен</div>
            <div className="mt-1 text-sm font-semibold text-rose-700/75">Администратор отменил заказ</div>
            <span className="canceled-dot canceled-dot-1" />
            <span className="canceled-dot canceled-dot-2" />
            <span className="canceled-dot canceled-dot-3" />
            <span className="canceled-dot canceled-dot-4" />
            <span className="canceled-dot canceled-dot-5" />
            <span className="canceled-dot canceled-dot-6" />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md space-y-3.5">
        {/* Header island */}
        <div className="sticky top-2 z-30 overflow-hidden rounded-[28px] border border-white/85 bg-white/70 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.14),0_1.5px_0_rgba(255,255,255,0.95)_inset] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Отслеживание</div>
              <div className="mt-0.5 text-[1.9rem] font-extrabold leading-none tracking-tight text-slate-900">Заказ</div>
            </div>
            {data && !isArchived && (
              <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusMeta.badgeClassName}`}>
                {statusMeta.label}
              </span>
            )}
          </div>
        </div>

        {orderLoading && !data ? (
          <Card className="p-5">
            <div className="space-y-3">
              <div className="h-4 w-48 rounded-full skeleton" />
              <div className="h-3 w-32 rounded-full skeleton" />
            </div>
          </Card>
        ) : hasNoActiveOrder ? (
          <Card className="p-5 text-center">
            <div className="text-2xl">📋</div>
            <div className="mt-2 font-semibold text-slate-700">Нет активных заказов</div>
            <div className="mt-1 text-sm text-slate-400">Оформите новый заказ в меню</div>
            <Link href={`/r/${menuSlug}`} className="mt-4 block rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-3 text-center text-sm font-bold text-white shadow-[0_8px_20px_rgba(249,115,22,0.3)]">
              В меню
            </Link>
          </Card>
        ) : !isArchived ? (
          <>
            <Card className="overflow-hidden p-0">
              <div className="p-4">
                <StatusProgress status={data?.status ?? ""} />
                <DeliveryTracker
                  status={data?.status ?? ""}
                  createdAt={data?.createdAt}
                  paymentConfirmedAt={data?.paymentConfirmedAt}
                  deliveredAt={data?.deliveredAt}
                />

                {/* Cancel timer + push notifications */}
                {data && !isHistoryStatus(data.status) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canCancel && <CancelTimer createdAt={data.createdAt} />}
                    <PushSubscribeButton orderId={orderId} />
                  </div>
                )}

                {/* Order details */}
                <div className="mt-3 rounded-2xl border border-black/8 bg-white/60 p-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="text-slate-500">Итого</div>
                    <div className="text-right text-base font-extrabold text-slate-900">{formatKgs(data?.totalKgs ?? 0)}</div>
                    <div className="text-slate-500">Плательщик</div>
                    <div className="text-right font-bold break-words text-slate-800">{data?.payerName ?? "—"}</div>
                    <div className="text-slate-500">Оплата</div>
                    <div className="text-right text-slate-700">{paymentMethodLabel(data?.paymentMethod ?? "")}</div>
                    <div className="text-slate-500">Телефон</div>
                    <div className="text-right text-slate-700">{data?.customerPhone ?? "—"}</div>
                    <div className="text-slate-500">Создан</div>
                    <div className="text-right text-slate-700">{data?.createdAt ? new Date(data.createdAt).toLocaleString() : "—"}</div>
                  </div>
                </div>

                <div className="mt-2 rounded-2xl border border-black/8 bg-white/60 px-3 py-2 text-sm text-slate-700">
                  Проход <span className="font-bold">{data?.location?.line ?? "—"}</span>, контейнер <span className="font-bold">{data?.location?.container ?? "—"}</span>
                  {data?.location?.landmark ? <> ({data.location.landmark})</> : null}
                </div>
                {data?.comment ? (
                  <div className="mt-2 rounded-2xl border border-black/8 bg-amber-50/60 px-3 py-2 text-sm text-slate-600">
                    💬 {data.comment}
                  </div>
                ) : null}
              </div>
            </Card>

            <div className="space-y-3">
              {(data?.items ?? []).map((it) => (
                <Card key={it.id} className="p-3">
                  <div className="flex gap-3">
                    <Photo src={it.photoUrl} alt={it.title} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 font-semibold break-words text-slate-900">{it.title}</div>
                        <div className="shrink-0 whitespace-nowrap rounded-xl border border-amber-200/70 bg-gradient-to-b from-amber-50 to-amber-100/60 px-2 py-1 text-xs font-extrabold text-amber-700">
                          {formatKgs(it.priceKgs * it.qty)}
                        </div>
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {it.qty} × {formatKgs(it.priceKgs)}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <Card className="p-5 text-center">
            <div className="text-2xl">✅</div>
            <div className="mt-2 font-semibold text-slate-700">Заказ завершён</div>
            <div className="mt-1 text-sm text-slate-400">Перенесён в историю</div>
            <Link href={`/r/${menuSlug}`} className="mt-4 block rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-3 text-center text-sm font-bold text-white shadow-[0_8px_20px_rgba(249,115,22,0.3)]">
              В меню
            </Link>
          </Card>
        )}

        {/* History */}
        <Card className="overflow-hidden p-0">
          <button className="flex w-full items-center justify-between px-4 py-4 text-left" onClick={() => setHistoryOpen((value) => !value)}>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <IconHistory className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-700">История заказов</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">{history.length}</span>
              <IconChevron open={historyOpen} className="h-4 w-4 text-slate-400" />
            </div>
          </button>

          {historyOpen && (
            <div className="border-t border-black/8 px-4 pb-4 pt-3">
              <div className="space-y-2">
                {history.map((order) => {
                  const isExpanded = openedHistoryOrderId === order.id;
                  const createdDate = new Date(order.createdAt);

                  return (
                    <div key={order.id} className="rounded-2xl border border-black/8 bg-white/60">
                      <button
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                        onClick={() => setOpenedHistoryOrderId((value) => (value === order.id ? null : order.id))}
                      >
                        <div className="w-6 shrink-0">{historyStatusIcon(order.status)}</div>
                        <div className="flex-1 text-center text-sm font-bold text-slate-800">{formatKgs(order.totalKgs)}</div>
                        <div className="w-32 shrink-0 text-right">
                          <div className="text-xs text-slate-400">{createdDate.toLocaleDateString()}</div>
                          <div className="text-xs text-slate-400">{createdDate.toLocaleTimeString()}</div>
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                            <span>{isExpanded ? "Свернуть" : "Подробнее"}</span>
                            <IconChevron open={isExpanded} className="h-3.5 w-3.5" />
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="motion-fade-up border-t border-black/8 px-3 pb-3 pt-2">
                          <div className="text-xs text-slate-500">
                            {order.restaurant?.name ?? "—"} · {paymentMethodLabel(order.paymentMethod)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Проход {order.location?.line ?? "—"}, контейнер {order.location?.container ?? "—"}
                          </div>
                          {order.comment ? <div className="mt-1 text-xs text-slate-500">💬 {order.comment}</div> : null}

                          <div className="mt-3 space-y-2">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center gap-2 rounded-xl border border-black/8 bg-white/70 p-2">
                                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/5 ring-1 ring-black/5">
                                  <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="40px" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold text-slate-800">{item.title}</div>
                                  <div className="text-xs text-slate-400">{item.qty} × {formatKgs(item.priceKgs)}</div>
                                </div>
                                <div className="text-sm font-bold text-slate-800">{formatKgs(item.priceKgs * item.qty)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {history.length === 0 && <div className="py-2 text-center text-sm text-slate-400">История заказов пока пуста.</div>}
              </div>
            </div>
          )}
        </Card>
      </div>

      <ClientNav menuHref={`/r/${menuSlug}`} orderHref={orderHref ?? (lastOrderId ? `/order/${lastOrderId}` : null)} />
    </main>
  );
}
