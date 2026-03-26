"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ClientNav } from "@/components/ClientNav";
import {
  clearActiveOrderId,
  clearPendingPayOrderId,
  getOrderHistoryEntry,
  getSavedPayerName,
  removeOrderFromHistory,
  setActiveOrderId,
  setPendingPayOrderId,
  setSavedPayerName
} from "@/lib/clientPrefs";
import { useCart } from "@/lib/cartStore";
import { buildMbankPayUrl, normalizeMbankNumber } from "@/lib/mbankLink";
import { formatKgs } from "@/lib/money";
import { isHistoryStatus } from "@/lib/orderStatus";

type OrderResp = {
  id: string;
  status: "created" | "pending_confirmation" | "confirmed" | "cooking" | "delivering" | "delivered" | "canceled";
  totalKgs: number;
  payerName?: string;
  restaurant: { name: string; slug: string; mbankNumber?: string };
  items?: Array<{ qty: number; priceKgs: number }>;
};

const CONFIRMED_STATUSES = new Set<OrderResp["status"]>(["confirmed", "cooking", "delivering", "delivered"]);
const card = "rounded-[30px] border border-[#ecdcc5] bg-white/92 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ошибка";
}

function getEffectiveTotalKgs(order: OrderResp | null, fallbackTotalKgs = 0) {
  if (!order) return fallbackTotalKgs;
  const apiTotal = Number(order.totalKgs);
  if (Number.isFinite(apiTotal) && apiTotal > 0) return Math.round(apiTotal);
  const computed = (order.items ?? []).reduce((sum, line) => sum + Math.max(0, Math.round(line.qty)) * Math.max(0, Math.round(line.priceKgs)), 0);
  return computed > 0 ? computed : fallbackTotalKgs;
}

function Check({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function PayScreen({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [navigatingToOrder, setNavigatingToOrder] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [waitingForAdmin, setWaitingForAdmin] = useState(false);
  const [showApprovedCheck, setShowApprovedCheck] = useState(false);
  const [showAdminCanceledFx, setShowAdminCanceledFx] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const prevStatusRef = useRef<OrderResp["status"] | null>(null);
  const cancelInitiatedByClientRef = useRef(false);
  const router = useRouter();
  const clearCart = useCart((state) => state.clear);

  const historyTotalKgs = useMemo(() => {
    const value = getOrderHistoryEntry(orderId)?.totalKgs ?? 0;
    return Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0;
  }, [orderId]);

  const effectiveTotalKgs = useMemo(() => getEffectiveTotalKgs(data, historyTotalKgs), [data, historyTotalKgs]);
  const mbankNumber = useMemo(() => normalizeMbankNumber(data?.restaurant?.mbankNumber), [data?.restaurant?.mbankNumber]);
  const resolvedBankUrl = useMemo(() => (effectiveTotalKgs > 0 ? buildMbankPayUrl({ totalKgs: effectiveTotalKgs, bankPhone: mbankNumber }) : null), [effectiveTotalKgs, mbankNumber]);
  const isApproved = data ? CONFIRMED_STATUSES.has(data.status) : false;
  const isCanceled = data?.status === "canceled";

  useEffect(() => {
    setPendingPayOrderId(orderId);
    setActiveOrderId(orderId);
  }, [orderId]);

  useEffect(() => {
    let stopped = false;
    const loadOrder = async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as OrderResp;
        if (!stopped) setData(payload);
      } catch {
        // ignore transient failures
      }
    };
    void loadOrder();
    const fallbackTimer = window.setInterval(() => void loadOrder(), 15000);
    let eventSource: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      eventSource = new EventSource(`/api/orders/${orderId}/stream`);
      eventSource.addEventListener("snapshot", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { order?: { id: string; status: OrderResp["status"] } | null };
          if (!stopped && payload?.order) {
            setData((prev) => (prev && prev.id === payload.order?.id ? { ...prev, status: payload.order.status } : prev));
            void loadOrder();
          }
        } catch {
          // ignore
        }
      });
    }
    return () => {
      stopped = true;
      window.clearInterval(fallbackTimer);
      if (eventSource) eventSource.close();
    };
  }, [orderId]);

  useEffect(() => {
    const savedName = getSavedPayerName().trim();
    if (savedName) setPayerName(savedName);
  }, []);

  useEffect(() => {
    if (data?.payerName && !payerName.trim()) setPayerName(data.payerName);
  }, [data?.payerName, payerName]);

  useEffect(() => {
    if (data?.status === "pending_confirmation") setWaitingForAdmin(true);
  }, [data?.status]);

  useEffect(() => {
    if (!isCanceled) return;
    clearCart();
    clearActiveOrderId(orderId);
    clearPendingPayOrderId(orderId);
    removeOrderFromHistory(orderId);
  }, [isCanceled, clearCart, orderId]);

  useEffect(() => {
    const status = data?.status;
    if (!status) return;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== "canceled" || cancelInitiatedByClientRef.current) return;
    const canceledAfterPayment = prevStatus === "pending_confirmation" || (!!prevStatus && CONFIRMED_STATUSES.has(prevStatus));
    if (!canceledAfterPayment) return;
    setWaitingForAdmin(false);
    setShowApprovedCheck(false);
    setShowAdminCanceledFx(true);
  }, [data?.status]);

  useEffect(() => {
    if (!data) return;
    if (isHistoryStatus(data.status)) clearActiveOrderId(orderId);
    else setActiveOrderId(orderId);
  }, [data, orderId]);

  useEffect(() => {
    if (!data) return;
    if (CONFIRMED_STATUSES.has(data.status) || data.status === "canceled") clearPendingPayOrderId(orderId);
  }, [data, orderId]);

  useEffect(() => {
    if (!isApproved) return setShowApprovedCheck(false);
    const timer = window.setTimeout(() => setShowApprovedCheck(true), 120);
    return () => window.clearTimeout(timer);
  }, [isApproved]);

  useEffect(() => {
    if (!showAdminCanceledFx) return;
    const target = data?.restaurant?.slug ? `/r/${data.restaurant.slug}` : "/";
    const timer = window.setTimeout(() => router.replace(target), 2300);
    return () => window.clearTimeout(timer);
  }, [showAdminCanceledFx, data?.restaurant?.slug, router]);

  useEffect(() => {
    if (!isApproved || !showApprovedCheck || navigatingToOrder) return;
    const timer = window.setTimeout(() => openOrder(), 2000);
    return () => window.clearTimeout(timer);
  }, [isApproved, showApprovedCheck, navigatingToOrder]);

  const menuHref = data?.restaurant?.slug ? `/r/${data.restaurant.slug}` : "/";

  function openOrder() {
    setNavigatingToOrder(true);
    window.setTimeout(() => router.push(`/order/${orderId}`), 120);
  }

  async function markPaid() {
    const payer = payerName.trim();
    if (payer.length < 2) return toast.error("Укажите имя отправителя перевода");
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/mark-paid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payerName: payer })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Ошибка");
      setSavedPayerName(payer);
      clearCart();
      setWaitingForAdmin(true);
      toast.success("Ожидаем подтверждения администратора");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function cancelOrder() {
    setCancelling(true);
    cancelInitiatedByClientRef.current = true;
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось отменить заказ");
      clearCart();
      clearActiveOrderId(orderId);
      clearPendingPayOrderId(orderId);
      removeOrderFromHistory(orderId);
      setWaitingForAdmin(false);
      setShowApprovedCheck(false);
      setData((prev) => (prev ? { ...prev, status: "canceled" } : prev));
      toast.success("Заказ отменен");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  const showCanceledCard = isCanceled && !isApproved && !showAdminCanceledFx;
  const showWaitingCard = waitingForAdmin && !isApproved && !showCanceledCard;
  const showPayCard = !showWaitingCard && !isApproved && !showCanceledCard;

  return (
    <main className="min-h-screen px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5">
      <div className="mx-auto max-w-md">
        <div className="rounded-[32px] border border-[#efdec5] bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(255,246,232,0.94))] px-5 py-5 shadow-[0_24px_60px_-42px_rgba(180,83,9,0.28)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-orange-500">Оплата</div>
          <h1 className="mt-1 text-[2.45rem] font-black leading-none tracking-[-0.04em] text-[#2f2419]">{data?.restaurant?.name ?? "Банковский перевод"}</h1>
        </div>

        <div className="mt-4 space-y-3">
          {showPayCard && (
            <div className={`${card} overflow-hidden`}>
              <div className="border-b border-[#f1e4d0] px-5 py-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">К оплате</div>
                <div className="mt-2 text-[3rem] font-black leading-none tracking-[-0.04em] text-[#2f2419]">
                  {effectiveTotalKgs > 0 ? formatKgs(effectiveTotalKgs) : "-"}
                </div>
              </div>

              <div className="space-y-3 px-5 py-5">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold text-[#8c7557]">Имя отправителя перевода</label>
                  <input
                    className="w-full rounded-[20px] border border-[#eadcc6] bg-white px-4 py-3 text-sm text-[#2f2419] placeholder:text-[#af8d67]"
                    placeholder="Как вас зовут?"
                    value={payerName}
                    onChange={(event) => setPayerName(event.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-[#8c7557]">Укажите имя, которое будет видно в переводе.</p>
                </div>

                {resolvedBankUrl ? (
                  <a
                    href={resolvedBankUrl}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-[22px] bg-emerald-600 text-base font-black tracking-wide text-white shadow-[0_18px_34px_-24px_rgba(5,150,105,0.75)] transition-all duration-200 hover:bg-emerald-500 active:scale-[0.98]"
                    aria-label="Перейти к оплате в банке"
                  >
                    Оплатить в банке
                  </a>
                ) : (
                  <div className="flex h-14 w-full items-center justify-center rounded-[22px] border border-[#eadcc6] bg-[#fff8ee] text-sm font-semibold text-[#8c7557]">
                    Банковский номер не настроен
                  </div>
                )}

                <button
                  onClick={() => void markPaid()}
                  disabled={loading || cancelling}
                  className="w-full rounded-[22px] border border-[#eadcc6] bg-white py-3.5 text-sm font-bold text-[#3b2f21] transition-all duration-200 hover:bg-[#fff8ee] disabled:opacity-50"
                >
                  {loading ? "Отправляем..." : "Я оплатил(а)"}
                </button>

                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={loading || cancelling}
                  className="w-full rounded-[22px] py-3 text-sm font-semibold text-red-600 transition-all duration-200 hover:text-red-700 disabled:opacity-40"
                >
                  {cancelling ? "Отменяем..." : "Отменить заказ"}
                </button>
              </div>
            </div>
          )}

          {showWaitingCard && (
            <div className={`${card} p-6`}>
              <div className="flex flex-col items-center text-center">
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 animate-ping rounded-full bg-amber-200/60" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-amber-200 bg-amber-50">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  </div>
                </div>
                <div className="mt-4 text-lg font-black text-[#2f2419]">Проверяем оплату</div>
                <div className="mt-1 text-sm text-[#7d6a54]">Ожидаем подтверждения администратора...</div>
              </div>
            </div>
          )}

          {isApproved && (
            <div className={`${card} border-emerald-200 p-6`}>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_12px_24px_-16px_rgba(5,150,105,0.75)]">
                  <Check className="h-7 w-7" />
                </div>
                <div className="mt-4 text-lg font-black text-emerald-700">Оплата подтверждена</div>
                <div className="mt-1 text-sm text-[#7d6a54]">Переходим к заказу...</div>
              </div>
            </div>
          )}

          {showCanceledCard && (
            <div className={`${card} border-red-200 p-6`}>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_12px_24px_-16px_rgba(239,68,68,0.75)]">
                  <Cross className="h-7 w-7" />
                </div>
                <div className="mt-4 text-lg font-black text-red-700">Заказ отменен</div>
                <div className="mt-1 text-sm text-[#7d6a54]">Возвращаем в меню...</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ClientNav menuHref={menuHref} orderHref={`/pay/${orderId}`} />

      {navigatingToOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2a1704]/28 px-6">
          <div className="rounded-[28px] border border-[#ecdcc5] bg-white px-8 py-6 shadow-[0_30px_70px_-36px_rgba(120,53,15,0.4)]">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <div className="mt-3 text-center text-sm font-semibold text-[#3b2f21]">Переходим к заказу...</div>
          </div>
        </div>
      )}

      {showAdminCanceledFx && <div className="canceled-overlay pointer-events-none fixed inset-0 z-50" />}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <button className="absolute inset-0 bg-[#2a1704]/28" aria-label="Закрыть" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-[30px] border border-[#ecdcc5] bg-white p-6 shadow-[0_30px_70px_-36px_rgba(120,53,15,0.4)]">
            <div className="text-lg font-black text-[#2f2419]">Отменить заказ?</div>
            <div className="mt-2 text-sm text-[#7d6a54]">Это действие нельзя отменить.</div>
            <div className="mt-5 flex gap-3">
              <button className="flex-1 rounded-[22px] border border-[#eadcc6] bg-[#fff8ee] py-3 text-sm font-semibold text-[#3b2f21]" onClick={() => setShowCancelConfirm(false)}>
                Назад
              </button>
              <button
                className="flex-1 rounded-[22px] bg-red-500 py-3 text-sm font-bold text-white shadow-[0_18px_34px_-24px_rgba(239,68,68,0.75)]"
                onClick={() => {
                  setShowCancelConfirm(false);
                  void cancelOrder();
                }}
              >
                Да, отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {isApproved && showApprovedCheck && <div className="approved-overlay pointer-events-none fixed inset-0 z-50" />}
    </main>
  );
}
