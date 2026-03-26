"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card } from "@/components/ui";
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
  restaurant: {
    name: string;
    slug: string;
    mbankNumber?: string;
  };
  items?: Array<{ qty: number; priceKgs: number }>;
};

const CONFIRMED_STATUSES = new Set<OrderResp["status"]>(["confirmed", "cooking", "delivering", "delivered"]);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error";
}

function getEffectiveTotalKgs(order: OrderResp | null, fallbackTotalKgs = 0) {
  if (!order) return fallbackTotalKgs;
  const apiTotal = Number(order.totalKgs);
  if (Number.isFinite(apiTotal) && apiTotal > 0) return Math.round(apiTotal);
  const lines = order.items ?? [];
  const computedFromItems = lines.reduce((sum, line) => {
    const qty = Number(line.qty);
    const priceKgs = Number(line.priceKgs);
    if (!Number.isFinite(qty) || !Number.isFinite(priceKgs)) return sum;
    return sum + Math.max(0, Math.round(qty)) * Math.max(0, Math.round(priceKgs));
  }, 0);
  if (computedFromItems > 0) return computedFromItems;
  return fallbackTotalKgs;
}

function IconCheck({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCross({ className = "h-5 w-5" }: { className?: string }) {
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
    const totalFromHistory = getOrderHistoryEntry(orderId)?.totalKgs ?? 0;
    const parsed = Number(totalFromHistory);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }, [orderId]);

  const effectiveTotalKgs = useMemo(() => getEffectiveTotalKgs(data, historyTotalKgs), [data, historyTotalKgs]);
  const mbankNumber = useMemo(() => normalizeMbankNumber(data?.restaurant?.mbankNumber), [data?.restaurant?.mbankNumber]);

  const resolvedBankUrl = useMemo(() => {
    if (effectiveTotalKgs <= 0) return null;
    return buildMbankPayUrl({ totalKgs: effectiveTotalKgs, bankPhone: mbankNumber });
  }, [effectiveTotalKgs, mbankNumber]);

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
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!res.ok) return;
        const response = (await res.json()) as OrderResp;
        if (!stopped) setData(response);
      } catch {
        // Ignore transient failures.
      }
    };

    void loadOrder();

    const fallbackTimer = window.setInterval(() => { void loadOrder(); }, 15000);

    let es: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      es = new EventSource(`/api/orders/${orderId}/stream`);
      es.addEventListener("snapshot", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            order?: { id: string; status: OrderResp["status"] } | null;
          };
          if (!stopped && payload?.order) {
            setData((prev) => {
              if (!prev || prev.id !== payload.order?.id) return prev;
              return { ...prev, status: payload.order.status };
            });
            void loadOrder();
          }
        } catch { /* noop */ }
      });
      es.onerror = () => { /* Fallback timer continues to work. */ };
    }

    return () => {
      stopped = true;
      window.clearInterval(fallbackTimer);
      if (es) es.close();
    };
  }, [orderId]);

  useEffect(() => {
    const savedName = getSavedPayerName().trim();
    if (savedName) setPayerName(savedName);
  }, []);

  useEffect(() => {
    if (data?.payerName && !payerName.trim()) {
      setPayerName(data.payerName);
    }
  }, [data?.payerName, payerName]);

  useEffect(() => {
    if (data?.status === "pending_confirmation") {
      setWaitingForAdmin(true);
    }
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
    if (isHistoryStatus(data.status)) {
      clearActiveOrderId(orderId);
      return;
    }
    setActiveOrderId(orderId);
  }, [data, orderId]);

  useEffect(() => {
    if (!data) return;
    if (CONFIRMED_STATUSES.has(data.status) || data.status === "canceled") {
      clearPendingPayOrderId(orderId);
    }
  }, [data, orderId]);

  useEffect(() => {
    if (!isApproved) {
      setShowApprovedCheck(false);
      return;
    }
    const timer = window.setTimeout(() => setShowApprovedCheck(true), 120);
    return () => window.clearTimeout(timer);
  }, [isApproved]);

  useEffect(() => {
    if (!showAdminCanceledFx) return;
    const menuTarget = data?.restaurant?.slug ? `/r/${data.restaurant.slug}` : "/";
    const timer = window.setTimeout(() => { router.replace(menuTarget); }, 2300);
    return () => window.clearTimeout(timer);
  }, [showAdminCanceledFx, data?.restaurant?.slug, router]);

  useEffect(() => {
    if (!isApproved || !showApprovedCheck || navigatingToOrder) return;
    const timer = window.setTimeout(() => { openOrder(); }, 2000);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproved, showApprovedCheck, navigatingToOrder]);

  const menuHref = data?.restaurant?.slug ? `/r/${data.restaurant.slug}` : "/";

  function openOrder() {
    setNavigatingToOrder(true);
    window.setTimeout(() => { router.push(`/order/${orderId}`); }, 120);
  }

  async function markPaid() {
    const payer = payerName.trim();
    if (payer.length < 2) {
      toast.error("Укажи имя отправителя перевода");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/mark-paid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payerName: payer })
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Ошибка");
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
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Не удалось отменить заказ");
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
    <main className="min-h-screen px-4 pb-52 pt-4">
      <div className="mx-auto max-w-md">

        {/* Header island */}
        <div className="sticky top-2 z-30 overflow-hidden rounded-[28px] border border-white/85 bg-white/70 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.14),0_1.5px_0_rgba(255,255,255,0.95)_inset] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Оплата</div>
          <div className="mt-0.5 text-[1.9rem] font-extrabold leading-none tracking-tight text-slate-900">
            {data?.restaurant?.name ?? "Банком"}
          </div>
        </div>

        <div className="mt-3.5 space-y-3">

          {/* ── Pay card ── */}
          {showPayCard && (
            <Card className="overflow-hidden p-0">
              {/* Amount row */}
              <div className="border-b border-white/60 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">К оплате</div>
                <div className="mt-1 text-[2.2rem] font-extrabold leading-none tracking-tight text-slate-900">
                  {effectiveTotalKgs > 0 ? formatKgs(effectiveTotalKgs) : "—"}
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Payer name input */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Имя отправителя перевода</label>
                  <input
                    className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                    placeholder="Как вас зовут?"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-slate-400">Укажите имя, которое будет видно в переводе</p>
                </div>

                {/* Bank payment button */}
                {resolvedBankUrl ? (
                  <a
                    href={resolvedBankUrl}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-base font-extrabold tracking-wide text-white shadow-[0_12px_28px_rgba(16,185,129,0.38),0_1px_0_rgba(255,255,255,0.22)_inset] transition-all duration-300 hover:shadow-[0_16px_34px_rgba(16,185,129,0.48)] active:scale-[0.98]"
                    aria-label="Перейти к оплате в банк"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                      <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
                      <path d="M2 10h20" stroke="currentColor" strokeWidth="2"/>
                      <path d="M6 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    Оплатить в банке
                  </a>
                ) : (
                  <div className="flex h-14 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-100/80 text-sm font-semibold text-slate-400">
                    Банк не настроен
                  </div>
                )}

                {/* Confirm paid */}
                <button
                  onClick={() => void markPaid()}
                  disabled={loading || cancelling}
                  className="w-full rounded-2xl border border-black/10 bg-white/80 py-3.5 text-sm font-bold text-slate-700 shadow-sm transition-all duration-200 hover:bg-white hover:shadow-md disabled:opacity-50"
                >
                  {loading ? "Отправляем..." : "✅ Я оплатил(а)"}
                </button>

                {/* Cancel */}
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={loading || cancelling}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-rose-500 transition-all duration-200 hover:text-rose-600 disabled:opacity-40"
                >
                  {cancelling ? "Отменяем..." : "Отменить заказ"}
                </button>
              </div>
            </Card>
          )}

          {/* ── Waiting card ── */}
          {showWaitingCard && (
            <Card className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-amber-200/80 bg-gradient-to-b from-amber-50 to-amber-100/60">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  </div>
                </div>
                <div className="mt-4 text-lg font-extrabold text-slate-800">Проверяем оплату</div>
                <div className="mt-1 text-sm text-slate-500">Ожидаем подтверждения администратора...</div>
              </div>
            </Card>
          )}

          {/* ── Approved card ── */}
          {isApproved && (
            <Card className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_10px_24px_rgba(5,150,105,0.4)]">
                  <IconCheck className="h-7 w-7" />
                </div>
                <div className="mt-4 text-lg font-extrabold text-emerald-700">Оплата подтверждена</div>
                <div className="mt-1 text-sm text-slate-500">Переходим к заказу...</div>
              </div>
            </Card>
          )}

          {/* ── Canceled card ── */}
          {showCanceledCard && (
            <Card className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_10px_24px_rgba(225,29,72,0.4)]">
                  <IconCross className="h-7 w-7" />
                </div>
                <div className="mt-4 text-lg font-extrabold text-rose-700">Заказ отменен</div>
                <div className="mt-1 text-sm text-slate-500">Возвращаем в меню...</div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <ClientNav menuHref={menuHref} orderHref={`/pay/${orderId}`} />

      {/* Navigating overlay */}
      {navigatingToOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/75 backdrop-blur-md">
          <div className="rounded-3xl border border-white/85 bg-white/90 px-8 py-6 shadow-[0_28px_60px_rgba(15,23,42,0.20)] backdrop-blur-2xl">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <div className="mt-3 text-center text-sm font-semibold text-slate-700">Переходим к заказу...</div>
          </div>
        </div>
      )}

      {/* Admin canceled FX */}
      {showAdminCanceledFx && (
        <div className="canceled-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="canceled-card relative w-full max-w-sm overflow-hidden rounded-[28px] border border-rose-200/80 bg-white/90 p-7 text-center shadow-[0_24px_70px_-24px_rgba(244,63,94,0.62)] backdrop-blur-xl">
            <div className="relative mx-auto h-24 w-24">
              <div className="canceled-cross-ring absolute inset-0 rounded-full border-4 border-rose-300/75" />
              <div className="canceled-cross-core absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_12px_30px_-12px_rgba(225,29,72,0.8)]">
                <IconCross className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 text-[24px] font-extrabold leading-tight text-rose-700">Заказ отменен</div>
            <div className="mt-1 text-sm font-semibold text-rose-700/75">Администратор отклонил оплату</div>
            <span className="canceled-dot canceled-dot-1" />
            <span className="canceled-dot canceled-dot-2" />
            <span className="canceled-dot canceled-dot-3" />
            <span className="canceled-dot canceled-dot-4" />
            <span className="canceled-dot canceled-dot-5" />
            <span className="canceled-dot canceled-dot-6" />
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Закрыть" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-[28px] border border-white/85 bg-white/92 p-6 shadow-[0_28px_60px_rgba(15,23,42,0.22)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
            <div className="text-lg font-extrabold text-slate-900">Отменить заказ?</div>
            <div className="mt-2 text-sm text-slate-500">Это действие нельзя отменить. Заказ будет удалён.</div>
            <div className="mt-5 flex gap-3">
              <button
                className="flex-1 rounded-2xl border border-black/10 bg-white/80 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
                onClick={() => setShowCancelConfirm(false)}
              >
                Назад
              </button>
              <button
                className="flex-1 rounded-2xl bg-rose-500 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(225,29,72,0.3)] transition hover:bg-rose-600"
                onClick={() => { setShowCancelConfirm(false); void cancelOrder(); }}
              >
                Да, отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approved FX */}
      {isApproved && showApprovedCheck && (
        <div className="approved-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="approved-card relative w-full max-w-sm overflow-hidden rounded-[30px] border border-emerald-200/85 bg-white/90 p-7 text-center shadow-[0_28px_75px_-26px_rgba(16,185,129,0.7)] backdrop-blur-xl">
            <div className="approved-shine absolute inset-x-[-24%] top-0 h-16 -rotate-6 bg-gradient-to-r from-transparent via-white/65 to-transparent" />
            <div className="relative mx-auto h-24 w-24">
              <div className="approved-ring absolute inset-0 rounded-full border-4 border-emerald-300/70" />
              <div className="approved-core absolute inset-[14px] flex items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_14px_34px_-14px_rgba(5,150,105,0.95)]">
                <IconCheck className="h-8 w-8" />
              </div>
            </div>
            <div className="mt-4 text-[24px] font-extrabold leading-tight text-emerald-700">Оплата подтверждена</div>
            <div className="mt-1 text-sm font-semibold text-emerald-700/75">Заказ принят в работу</div>
            <span className="approved-dot approved-dot-1" />
            <span className="approved-dot approved-dot-2" />
            <span className="approved-dot approved-dot-3" />
            <span className="approved-dot approved-dot-4" />
            <span className="approved-dot approved-dot-5" />
            <span className="approved-dot approved-dot-6" />
          </div>
        </div>
      )}
    </main>
  );
}
