"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type OrderItem = { id: string; title: string; qty: number; priceKgs: number; photoUrl: string };
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
  items: OrderItem[];
};
type HistoryOrder = OrderData;

const WAITING_STATUSES = new Set(["confirmed", "cooking", "delivering"]);
const CANCEL_WINDOW_MS = 5 * 60 * 1000;
const DELIVERY_STEPS = ["Подтвержден", "Готовится", "Передан курьеру", "Доставлен"] as const;

const card = "rounded-[30px] border border-[#ecdcc5] bg-white/92 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]";
const inset = "rounded-[22px] border border-[#f0e1ca] bg-[#fff8ee]";

function Check({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={`h-4 w-4 text-[#8c7557] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function statusDot(status: string) {
  if (status === "delivered") return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-3.5 w-3.5" /></span>;
  if (status === "canceled") return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700"><Cross className="h-3.5 w-3.5" /></span>;
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#fff0d6] text-[10px] font-bold text-[#b45309]">o</span>;
}

function etaText(date: Date | null) {
  if (!date) return "ETA уточняется";
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return `Плановое время: ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `Примерно через ${minutes} мин`;
  return `Примерно через ${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function resolveEta(status: string, createdAt?: string, paymentConfirmedAt?: string | null, deliveredAt?: string | null) {
  const created = parseDate(createdAt ?? null);
  const confirmed = parseDate(paymentConfirmedAt ?? null);
  const delivered = parseDate(deliveredAt ?? null);
  if (status === "delivered") return delivered;
  if (!created) return null;
  const base = confirmed ?? created;
  if (status === "confirmed") return new Date(base.getTime() + 35 * 60_000);
  if (status === "cooking") return new Date(base.getTime() + 22 * 60_000);
  if (status === "delivering") return new Date(base.getTime() + 10 * 60_000);
  if (status === "created" || status === "pending_confirmation") return new Date(created.getTime() + 45 * 60_000);
  return null;
}

function currentStep(status: string) {
  if (status === "confirmed") return 0;
  if (status === "cooking") return 1;
  if (status === "delivering") return 2;
  if (status === "delivered") return 3;
  return -1;
}

function CancelTimer({ createdAt }: { createdAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const created = new Date(createdAt).getTime();
    const tick = () => setRemaining(Math.max(0, created + CANCEL_WINDOW_MS - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [createdAt]);
  if (remaining === null) return null;
  if (remaining <= 0) return <div className="rounded-[18px] border border-[#eadcc6] bg-white px-3 py-2 text-xs font-semibold text-[#8c7557]">Время на отмену истекло</div>;
  const min = Math.floor(remaining / 60000);
  const sec = Math.floor((remaining % 60000) / 1000);
  return <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Можно отменить еще {min}:{sec.toString().padStart(2, "0")}</div>;
}

function PushSubscribeButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "subscribed" | "unsupported">("idle");
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) setState("unsupported");
  }, []);
  const subscribe = async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return setState("unsupported");
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState("idle");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId, subscription: sub.toJSON() }) });
      setState("subscribed");
    } catch {
      setState("idle");
    }
  };
  if (state === "unsupported") return null;
  if (state === "subscribed") return <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Уведомления включены</div>;
  return (
    <button onClick={() => void subscribe()} disabled={state === "loading"} className="rounded-[18px] border border-[#eadcc6] bg-white px-3 py-2 text-xs font-semibold text-[#7d6a54] hover:text-[#2f2419] disabled:opacity-50">
      {state === "loading" ? "Подключаем..." : "Сообщать об изменениях"}
    </button>
  );
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

  const loadOrder = useCallback(async (silent = false) => {
    if (!silent) setOrderLoading(true);
    try {
      const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      if (response.status === 404) {
        setData(null);
        setOrderMissing(true);
        return;
      }
      if (!response.ok) return;
      setData((await response.json()) as OrderData);
      setOrderMissing(false);
    } finally {
      if (!silent) setOrderLoading(false);
    }
  }, [orderId]);

  const loadHistory = useCallback(async () => {
    const ids = getOrderHistory().map((entry) => entry.orderId).filter(Boolean);
    const phone = getSavedPhone().replace(/\D/g, "").trim();
    if (ids.length === 0 && phone.length < 7) return setHistory([]);
    const params = new URLSearchParams();
    if (ids.length) params.set("ids", ids.slice(0, 30).join(","));
    if (phone.length >= 7) params.set("phone", phone);
    const response = await fetch(`/api/orders/history?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return setHistory([]);
    const payload = (await response.json()) as { orders: HistoryOrder[] };
    setHistory((payload.orders ?? []).filter((order) => isHistoryStatus(order.status)));
  }, []);

  useEffect(() => {
    const pending = getPendingPayOrderId();
    const active = getActiveOrderId();
    const last = getLastOrderId();
    if (pending) {
      setLastOrderId(pending);
      setOrderHref(`/pay/${pending}`);
    } else if (active) {
      setLastOrderId(active);
      setOrderHref(`/order/${active}`);
    } else {
      setLastOrderId(last);
      setOrderHref(last ? `/order/${last}` : null);
    }
  }, []);

  useEffect(() => { void loadOrder(); }, [loadOrder]);
  useEffect(() => { void loadHistory(); }, [loadHistory, data?.status]);

  useEffect(() => {
    if (!data?.id) return;
    const bankPending = data.paymentMethod === "bank" && (data.status === "created" || data.status === "pending_confirmation");
    if (bankPending) {
      setPendingPayOrderId(data.id);
      setActiveOrderId(data.id);
      setLastOrderId(data.id);
      setOrderHref(`/pay/${data.id}`);
      return;
    }
    clearPendingPayOrderId(data.id);
    if (isHistoryStatus(data.status)) clearActiveOrderId(data.id);
    else setActiveOrderId(data.id);
    setLastOrderId(data.id);
    setOrderHref(`/order/${data.id}`);
  }, [data?.id, data?.paymentMethod, data?.status]);

  useEffect(() => {
    const status = data?.status;
    if (!status) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!prev) return;
    if (status === "delivered" && prev !== "delivered") {
      setShowDeliveredFx(true);
      const timer = setTimeout(() => setShowDeliveredFx(false), 2400);
      return () => clearTimeout(timer);
    }
    if (status === "canceled" && WAITING_STATUSES.has(prev)) {
      setShowCanceledFx(true);
      const timer = setTimeout(() => setShowCanceledFx(false), 2400);
      return () => clearTimeout(timer);
    }
  }, [data?.status]);

  useEffect(() => {
    const fallback = setInterval(() => void loadOrder(true), 5000);
    let es: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      es = new EventSource(`/api/orders/${orderId}/stream`);
      es.addEventListener("snapshot", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { order?: { id: string; status: string; updatedAt: string } | null };
          if (!payload?.order) {
            setData(null);
            setOrderMissing(true);
            return;
          }
          setData((prev) => prev && prev.id === payload.order?.id ? { ...prev, status: payload.order.status, updatedAt: payload.order.updatedAt } : prev);
          setOrderMissing(false);
          void loadOrder(true);
        } catch {
          // ignore
        }
      });
    }
    return () => {
      clearInterval(fallback);
      if (es) es.close();
    };
  }, [loadOrder, orderId]);

  const statusMeta = useMemo(() => getOrderStatusMeta(data?.status ?? ""), [data?.status]);
  const menuSlug = data?.restaurant?.slug ?? history[0]?.restaurant?.slug ?? "dordoi-food";
  const isArchived = isHistoryStatus(data?.status ?? "");
  const hasNoActiveOrder = !orderLoading && (orderMissing || !data);
  const canCancel = !!data && !isHistoryStatus(data.status) && Date.now() - new Date(data.createdAt).getTime() < CANCEL_WINDOW_MS;
  const step = currentStep(data?.status ?? "");
  const eta = resolveEta(data?.status ?? "", data?.createdAt, data?.paymentConfirmedAt, data?.deliveredAt);

  return (
    <main className="min-h-screen px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5">
      {showDeliveredFx && <div className="delivered-overlay pointer-events-none fixed inset-0 z-50" />}
      {showCanceledFx && <div className="canceled-overlay pointer-events-none fixed inset-0 z-50" />}

      <div className="mx-auto max-w-md space-y-3.5">
        <div className="rounded-[32px] border border-[#efdec5] bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(255,246,232,0.94))] px-5 py-5 shadow-[0_24px_60px_-42px_rgba(180,83,9,0.28)]">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-orange-500">Отслеживание</div>
              <h1 className="mt-1 text-[2.45rem] font-black leading-none tracking-[-0.04em] text-[#2f2419]">Заказ</h1>
            </div>
            {data && !isArchived && <span className={`mb-1 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusMeta.badgeClassName}`}>{statusMeta.label}</span>}
          </div>
        </div>

        {orderLoading && !data ? (
          <div className={`${card} p-5`}><div className="space-y-3"><div className="h-4 w-48 rounded-full skeleton" /><div className="h-3 w-32 rounded-full skeleton" /></div></div>
        ) : hasNoActiveOrder ? (
          <div className={`${card} p-6 text-center`}>
            <div className="text-2xl">+</div>
            <div className="mt-2 font-semibold text-[#2f2419]">Нет активных заказов</div>
            <div className="mt-1 text-sm text-[#7d6a54]">Оформите новый заказ в меню</div>
            <Link href={`/r/${menuSlug}`} className="mt-4 block rounded-[22px] bg-orange-500 py-3 text-center text-sm font-bold text-white shadow-[0_18px_34px_-24px_rgba(249,115,22,0.7)]">В меню</Link>
          </div>
        ) : !isArchived ? (
          <>
            <div className={`${card} overflow-hidden`}>
              <div className="p-5">
                <div className={`mt-1 rounded-[22px] px-4 py-3 text-sm font-semibold ${
                  isPendingConfirmation(data?.status ?? "") ? "border border-amber-200 bg-amber-50 text-amber-700" :
                  data?.status === "canceled" ? "border border-red-200 bg-red-50 text-red-700" :
                  isApprovedStatus(data?.status ?? "") ? "border border-emerald-200 bg-emerald-50 text-emerald-700" :
                  "border border-[#eadcc6] bg-white text-[#7d6a54]"
                }`}>
                  {isPendingConfirmation(data?.status ?? "") ? "Ожидаем подтверждения заказа" :
                    data?.status === "delivered" ? "Заказ доставлен" :
                    data?.status === "canceled" ? "Заказ отменен" :
                    "Заказ подтвержден"}
                </div>

                <div className={`${inset} mt-3 p-4`}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-500">Этапы доставки</div>
                  {step < 0 ? (
                    <>
                      <div className="mt-1 text-sm font-semibold text-[#2f2419]">Ожидаем подтверждения оплаты</div>
                      <div className="mt-1 text-xs text-[#8c7557]">{etaText(eta)}</div>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 space-y-2.5">
                        {DELIVERY_STEPS.map((label, index) => {
                          const done = index < step || data?.status === "delivered";
                          const current = index === step && data?.status !== "delivered";
                          return (
                            <div key={label} className="flex items-center gap-2.5">
                              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                done ? "bg-emerald-500 text-white" : current ? "bg-sky-500 text-white" : "bg-white text-[#8c7557] ring-1 ring-[#eadcc6]"
                              }`}>
                                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                              </span>
                              <span className={`text-sm ${done || current ? "font-semibold text-[#2f2419]" : "text-[#8c7557]"}`}>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 text-xs text-[#8c7557]">{data?.status === "delivered" ? "Заказ доставлен" : `ETA: ${etaText(eta)}`}</div>
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {canCancel && data?.createdAt && <CancelTimer createdAt={data.createdAt} />}
                  <PushSubscribeButton orderId={orderId} />
                </div>

                <div className={`${inset} mt-3 p-4`}>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="text-[#8c7557]">Итого</div>
                    <div className="text-right text-base font-black text-[#b45309]">{formatKgs(data?.totalKgs ?? 0)}</div>
                    <div className="text-[#8c7557]">Плательщик</div>
                    <div className="break-words text-right font-bold text-[#2f2419]">{data?.payerName ?? "-"}</div>
                    <div className="text-[#8c7557]">Оплата</div>
                    <div className="text-right text-[#4b3a28]">{paymentMethodLabel(data?.paymentMethod ?? "")}</div>
                    <div className="text-[#8c7557]">Телефон</div>
                    <div className="text-right text-[#4b3a28]">{data?.customerPhone ?? "-"}</div>
                    <div className="text-[#8c7557]">Создан</div>
                    <div className="text-right text-[#4b3a28]">{data?.createdAt ? new Date(data.createdAt).toLocaleString() : "-"}</div>
                  </div>
                </div>

                <div className={`${inset} mt-2 px-4 py-3 text-sm text-[#4b3a28]`}>
                  Проход <span className="font-bold text-[#2f2419]">{data?.location?.line ?? "-"}</span>, контейнер <span className="font-bold text-[#2f2419]">{data?.location?.container ?? "-"}</span>
                  {data?.location?.landmark ? ` (${data.location.landmark})` : ""}
                </div>

                {data?.comment ? <div className="mt-2 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[#7d6a54]">Комментарий: {data.comment}</div> : null}
              </div>
            </div>

            <div className="space-y-3">
              {(data?.items ?? []).map((item) => (
                <div key={item.id} className={`${card} p-4`}>
                  <div className="flex gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[18px] bg-[#f6ead7]">
                      <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="56px" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 break-words font-semibold text-[#2f2419]">{item.title}</div>
                        <div className="shrink-0 rounded-full bg-[#fff0d6] px-3 py-1 text-xs font-black text-[#b45309]">{formatKgs(item.priceKgs * item.qty)}</div>
                      </div>
                      <div className="mt-1 text-sm text-[#8c7557]">{item.qty} x {formatKgs(item.priceKgs)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className={`${card} p-6 text-center`}>
            <div className="text-2xl">OK</div>
            <div className="mt-2 font-semibold text-[#2f2419]">Заказ завершен</div>
            <div className="mt-1 text-sm text-[#7d6a54]">Он уже перенесен в историю</div>
            <Link href={`/r/${menuSlug}`} className="mt-4 block rounded-[22px] bg-orange-500 py-3 text-center text-sm font-bold text-white shadow-[0_18px_34px_-24px_rgba(249,115,22,0.7)]">В меню</Link>
          </div>
        )}

        <div className={`${card} overflow-hidden`}>
          <button className="flex w-full items-center justify-between px-5 py-4 text-left" onClick={() => setHistoryOpen((value) => !value)}>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#fff0d6] text-[#b45309]">H</span>
              <span className="text-sm font-semibold text-[#2f2419]">История заказов</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#8c7557]">{history.length}</span>
              <Chevron open={historyOpen} />
            </div>
          </button>

          {historyOpen && (
            <div className="border-t border-[#f1e4d0] px-5 pb-5 pt-3">
              <div className="space-y-2">
                {history.map((order) => {
                  const open = openedHistoryOrderId === order.id;
                  const created = new Date(order.createdAt);
                  return (
                    <div key={order.id} className={`${inset} overflow-hidden`}>
                      <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpenedHistoryOrderId((value) => value === order.id ? null : order.id)}>
                        <div className="w-6 shrink-0">{statusDot(order.status)}</div>
                        <div className="flex-1 text-center text-sm font-bold text-[#2f2419]">{formatKgs(order.totalKgs)}</div>
                        <div className="w-32 shrink-0 text-right">
                          <div className="text-xs text-[#8c7557]">{created.toLocaleDateString()}</div>
                          <div className="text-xs text-[#8c7557]">{created.toLocaleTimeString()}</div>
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#8c7557]"><span>{open ? "Свернуть" : "Подробнее"}</span><Chevron open={open} /></div>
                        </div>
                      </button>
                      {open && (
                        <div className="motion-fade-up border-t border-[#f0e1ca] px-4 pb-4 pt-2">
                          <div className="text-xs text-[#8c7557]">{order.restaurant?.name ?? "-"} | {paymentMethodLabel(order.paymentMethod)}</div>
                          <div className="mt-1 text-xs text-[#8c7557]">Проход {order.location?.line ?? "-"}, контейнер {order.location?.container ?? "-"}</div>
                          {order.comment ? <div className="mt-1 text-xs text-[#8c7557]">Комментарий: {order.comment}</div> : null}
                          <div className="mt-3 space-y-2">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center gap-2 rounded-[18px] border border-[#f0e1ca] bg-white p-2.5">
                                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[14px] bg-[#f6ead7]">
                                  <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="40px" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold text-[#2f2419]">{item.title}</div>
                                  <div className="text-xs text-[#8c7557]">{item.qty} x {formatKgs(item.priceKgs)}</div>
                                </div>
                                <div className="text-sm font-bold text-[#b45309]">{formatKgs(item.priceKgs * item.qty)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {history.length === 0 && <div className="py-2 text-center text-sm text-[#8c7557]">История заказов пока пуста.</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      <ClientNav menuHref={`/r/${menuSlug}`} orderHref={orderHref ?? (lastOrderId ? `/order/${lastOrderId}` : null)} />
    </main>
  );
}
