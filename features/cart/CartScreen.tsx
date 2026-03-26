"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card } from "@/components/ui";
import { ClientNav } from "@/components/ClientNav";
import { useCart } from "@/lib/cartStore";
import {
  addOrderToHistory,
  setActiveOrderId,
  clearPendingPayOrderId,
  getOrderHistory,
  getSavedLocation,
  getSavedPhone,
  setSavedLocation,
  setPendingPayOrderId,
  setSavedPhone,
  getSavedAddresses,
  addSavedAddress,
} from "@/lib/clientPrefs";
import { formatKgs } from "@/lib/money";

type PaymentMethod = "bank" | "cash";

type CreateOrderResponse = {
  orderId: string;
  bankPayUrl?: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ошибка";
}

function normalizeKgPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const rest = digits.startsWith("996") ? digits.slice(3) : digits;
  const normalized = `996${rest}`.slice(0, 12);
  return /^996\d{9}$/.test(normalized) ? normalized : null;
}

function formatKgPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const rest = digits.startsWith("996") ? digits.slice(3) : digits;
  const normalized = `996${rest}`.slice(0, 12);
  const local = normalized.slice(3);
  if (local.length === 0) return "996";
  if (local.length <= 3) return `996 (${local}`;
  if (local.length <= 6) return `996 (${local.slice(0, 3)}) ${local.slice(3)}`;
  return `996 (${local.slice(0, 3)}) ${local.slice(3, 6)} - ${local.slice(6, 9)}`;
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function QtyStepper({ qty, onInc, onDec }: { qty: number; onInc: () => void; onDec: () => void }) {
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-full border border-black/10 bg-white/80 px-1 shadow-[0_2px_8px_rgba(15,23,42,0.08)]">
      <button
        type="button"
        onClick={onDec}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-200/80 bg-gradient-to-b from-rose-50 to-rose-100/80 text-rose-600 shadow-[0_2px_6px_rgba(225,29,72,0.12)] transition-all duration-200 active:scale-90"
        aria-label="Уменьшить"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><path d="M5 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      </button>
      <span className="min-w-[2rem] text-center text-sm font-extrabold text-slate-900">{qty}</span>
      <button
        type="button"
        onClick={onInc}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_3px_8px_rgba(249,115,22,0.35)] transition-all duration-200 active:scale-90"
        aria-label="Увеличить"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"><path d="M10 5v10M5 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      </button>
    </div>
  );
}

export default function CartScreen() {
  const restaurantSlug = useCart((state) => state.restaurantSlug);
  const lines = useCart((state) => state.lines);
  const total = useCart((state) => state.total());
  const count = useCart((state) => state.count());
  const setLines = useCart((state) => state.setLines);
  const inc = useCart((state) => state.inc);
  const dec = useCart((state) => state.dec);
  const clear = useCart((state) => state.clear);

  const [line, setLine] = useState("");
  const [container, setContainer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [comment, setComment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank");
  const [loading, setLoading] = useState(false);
  const [redirectingTo, setRedirectingTo] = useState<"pay" | "order" | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<Array<{ line: string; container: string }>>([]);
  const submitLockRef = useRef(false);

  useEffect(() => {
    setIsHydrated(true);
    setIdempotencyKey(createIdempotencyKey());
    setCustomerPhone(formatKgPhone(getSavedPhone()));
    const savedLocation = getSavedLocation();
    setLine(savedLocation.line);
    setContainer(savedLocation.container);
    setSavedAddresses(getSavedAddresses());
  }, []);

  const requestSignature = useMemo(
    () =>
      JSON.stringify({
        restaurantSlug,
        lines: lines.map((x) => ({ id: x.menuItemId, qty: x.qty })),
        line: line.trim(),
        container: container.trim(),
        customerPhone: normalizeKgPhone(customerPhone.trim()) ?? "",
        paymentMethod,
        comment: comment.trim()
      }),
    [restaurantSlug, lines, line, container, customerPhone, paymentMethod, comment]
  );

  useEffect(() => {
    if (!isHydrated) return;
    setIdempotencyKey(createIdempotencyKey());
  }, [isHydrated, requestSignature]);

  const canSubmit = useMemo(() => {
    return Boolean(
      isHydrated &&
        restaurantSlug &&
        lines.length > 0 &&
        line.trim().length > 0 &&
        container.trim().length > 0 &&
        Boolean(normalizeKgPhone(customerPhone)) &&
        !loading
    );
  }, [container, customerPhone, isHydrated, line, lines.length, loading, restaurantSlug]);

  const lastOrderSuggestion = useMemo(() => {
    if (!isHydrated) return null;
    const latest = getOrderHistory()[0];
    if (!latest?.restaurantSlug || !Array.isArray(latest.lines)) return null;
    const normalizedLines = latest.lines
      .map((item) => ({
        menuItemId: item.menuItemId ?? "",
        title: item.title,
        photoUrl: item.photoUrl,
        priceKgs: item.priceKgs,
        qty: item.qty
      }))
      .filter((item) => item.menuItemId.length > 0 && item.qty > 0);
    if (normalizedLines.length === 0) return null;
    return { ...latest, lines: normalizedLines };
  }, [isHydrated]);

  if (!isHydrated) {
    return (
      <main className="min-h-screen px-4 pb-52 pt-4">
        <div className="mx-auto max-w-md">
          <div className="h-10 w-32 rounded-2xl skeleton" />
          <Card className="mt-4 p-4">
            <div className="h-4 w-48 rounded-full skeleton" />
          </Card>
        </div>
      </main>
    );
  }

  async function submitOrder() {
    if (!restaurantSlug || lines.length === 0) {
      toast.error("Корзина пуста");
      return;
    }
    const phone = normalizeKgPhone(customerPhone.trim());
    if (!line.trim() || !container.trim()) {
      toast.error("Заполни проход и контейнер");
      return;
    }
    if (!phone) {
      toast.error("Укажи телефон в формате 996 (xxx) xxx - xxx");
      return;
    }
    if (submitLockRef.current || loading) return;
    submitLockRef.current = true;
    setLoading(true);
    try {
      const payload = {
        restaurantSlug,
        paymentMethod,
        customerPhone: phone,
        comment: comment.trim(),
        location: { line: line.trim(), container: container.trim() },
        items: lines.map((x) => ({ menuItemId: x.menuItemId, qty: x.qty })),
        idempotencyKey
      };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "x-idempotency-key": idempotencyKey },
        body: JSON.stringify(payload)
      });
      const j = (await res.json().catch(() => null)) as Partial<CreateOrderResponse> & { error?: string } | null;
      if (!res.ok || !j?.orderId) throw new Error(j?.error ?? "Не удалось создать заказ");
      setIdempotencyKey(createIdempotencyKey());
      addOrderToHistory({
        orderId: j.orderId,
        restaurantSlug,
        customerPhone: phone,
        totalKgs: total,
        createdAt: new Date().toISOString(),
        lines
      });
      setActiveOrderId(j.orderId);
      setSavedPhone(phone);
      setSavedLocation({ line: line.trim(), container: container.trim() });
      addSavedAddress({ line: line.trim(), container: container.trim() });
      clear();
      if (paymentMethod === "bank") {
        setPendingPayOrderId(j.orderId);
      } else {
        clearPendingPayOrderId();
      }
      const nextUrl = paymentMethod === "bank" ? `/pay/${j.orderId}` : `/order/${j.orderId}`;
      setRedirectingTo(paymentMethod === "bank" ? "pay" : "order");
      window.setTimeout(() => { window.location.assign(nextUrl); }, 180);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  }

  const menuHref = restaurantSlug ? `/r/${restaurantSlug}` : "/";

  // ── Empty cart ──────────────────────────────────────────────
  if (lines.length === 0) {
    function repeatLastOrder() {
      if (!lastOrderSuggestion) return;
      setLines(lastOrderSuggestion.restaurantSlug, lastOrderSuggestion.lines);
      if (lastOrderSuggestion.customerPhone) {
        setSavedPhone(lastOrderSuggestion.customerPhone.replace(/\D/g, ""));
        setCustomerPhone(formatKgPhone(lastOrderSuggestion.customerPhone));
      }
      toast.success("Последний заказ добавлен в корзину");
    }

    return (
      <main className="min-h-screen px-4 pb-52 pt-4">
        <div className="mx-auto max-w-md">
          {/* Header */}
          <div className="sticky top-2 z-30 overflow-hidden rounded-[28px] border border-white/85 bg-white/70 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.14),0_1.5px_0_rgba(255,255,255,0.95)_inset] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Корзина</div>
            <div className="mt-0.5 text-[1.9rem] font-extrabold leading-none tracking-tight text-slate-900">Пусто</div>
          </div>

          <div className="mt-4 space-y-3">
            <Card className="p-5 text-center">
              <div className="text-3xl">🛒</div>
              <div className="mt-2 font-semibold text-slate-700">В корзине пока ничего нет</div>
              <div className="mt-1 text-sm text-slate-400">Добавьте блюда из меню</div>
              <Link href={menuHref} className="mt-4 block">
                <Button variant="food" className="w-full rounded-full">Перейти в меню</Button>
              </Link>
            </Card>

            {lastOrderSuggestion && (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-white/60 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Последний заказ</div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-700">
                      {new Date(lastOrderSuggestion.createdAt).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 px-2.5 py-1 text-xs font-extrabold text-white">
                      {formatKgs(lastOrderSuggestion.totalKgs)}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {lastOrderSuggestion.lines.map((item) => (
                    <div key={`${item.menuItemId}-${item.title}`} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/60 p-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-black/5">
                        <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="44px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{item.title}</div>
                        <div className="text-xs text-slate-400">{item.qty} × {formatKgs(item.priceKgs)}</div>
                      </div>
                      <div className="text-sm font-bold text-slate-800">{formatKgs(item.priceKgs * item.qty)}</div>
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-4">
                  <button
                    onClick={repeatLastOrder}
                    className="w-full rounded-full border border-orange-300/40 bg-gradient-to-r from-orange-500 to-amber-400 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(249,115,22,0.3)] transition-all duration-300 hover:shadow-[0_12px_28px_rgba(249,115,22,0.4)] active:scale-[0.98]"
                  >
                    Повторить заказ
                  </button>
                </div>
              </Card>
            )}
          </div>
        </div>
        <ClientNav menuHref={menuHref} />
      </main>
    );
  }

  // ── Filled cart ─────────────────────────────────────────────
  return (
    <main className="min-h-screen px-4 pb-52 pt-4">
      <div className="mx-auto max-w-md">

        {/* Header island */}
        <div className="sticky top-2 z-30 overflow-hidden rounded-[28px] border border-white/85 bg-white/70 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.14),0_1.5px_0_rgba(255,255,255,0.95)_inset] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Оформление</div>
              <div className="mt-0.5 text-[1.9rem] font-extrabold leading-none tracking-tight text-slate-900">Корзина</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-orange-300/40 bg-gradient-to-r from-orange-500 to-amber-400 px-3 py-1 text-xs font-bold text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
                {count} шт
              </span>
              <Link className="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-white" href={menuHref}>
                В меню
              </Link>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="mt-3.5 space-y-3">
          {lines.map((lineItem) => (
            <Card key={lineItem.menuItemId} className="p-3">
              <div className="flex gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-black/5 shadow-[0_4px_12px_rgba(15,23,42,0.10)]">
                  <Image src={lineItem.photoUrl} alt={lineItem.title} fill className="object-cover" sizes="64px" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold leading-snug text-slate-900">{lineItem.title}</div>
                    <div className="shrink-0 rounded-xl border border-amber-200/70 bg-gradient-to-b from-amber-50 to-amber-100/60 px-2 py-1 text-xs font-extrabold text-amber-700">
                      {formatKgs(lineItem.priceKgs * lineItem.qty)}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-400">{formatKgs(lineItem.priceKgs)} × {lineItem.qty}</div>
                    <QtyStepper qty={lineItem.qty} onDec={() => dec(lineItem.menuItemId)} onInc={() => inc(lineItem.menuItemId)} />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Delivery address */}
        <Card className="mt-3.5 overflow-hidden p-0">
          <div className="border-b border-white/60 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Куда доставить</div>
          </div>
          <div className="p-4">
            {/* Saved address chips */}
            {savedAddresses.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {savedAddresses.map((addr, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setLine(addr.line); setContainer(addr.container); }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                      addr.line === line && addr.container === container
                        ? "border-orange-400/30 bg-gradient-to-r from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.28)]"
                        : "border-black/10 bg-white/80 text-slate-600 hover:bg-white"
                    }`}
                  >
                    {addr.line ? `Пр. ${addr.line}` : ""}{addr.line && addr.container ? ", " : ""}{addr.container ? `К. ${addr.container}` : ""}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Проход</label>
                <input
                  className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                  placeholder="Напр. 12"
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Контейнер</label>
                <input
                  className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                  placeholder="Напр. А-15"
                  value={container}
                  onChange={(e) => setContainer(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Телефон</label>
              <input
                className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                placeholder="996 (___) ___ - ___"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(formatKgPhone(e.target.value))}
                inputMode="tel"
                required
              />
            </div>
          </div>
        </Card>

        {/* Comment */}
        <Card className="mt-3 overflow-hidden p-0">
          <div className="border-b border-white/60 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Комментарий к заказу</div>
          </div>
          <div className="p-4">
            <textarea
              className="w-full resize-none rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
              placeholder="Например: без лука, острое, оставить у охраны..."
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </Card>

        {/* Payment method */}
        <Card className="mt-3 overflow-hidden p-0">
          <div className="border-b border-white/60 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Способ оплаты</div>
          </div>
          <div className="flex gap-2 p-4">
            {(["bank", "cash"] as const).map((method) => {
              const isActive = paymentMethod === method;
              const label = method === "bank" ? "💳 Банком" : "💵 Наличными";
              const hint = method === "bank" ? "Mbank, OBANK, Bakai" : "Курьеру при доставке";
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex flex-1 flex-col items-start rounded-2xl border p-3 text-left transition-all duration-300 ${
                    isActive
                      ? "border-orange-400/30 bg-gradient-to-br from-orange-50 to-amber-50 shadow-[0_4px_14px_rgba(249,115,22,0.12)]"
                      : "border-black/10 bg-white/60 hover:bg-white/80"
                  }`}
                >
                  <div className={`text-sm font-bold ${isActive ? "text-orange-700" : "text-slate-700"}`}>{label}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{hint}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Summary + CTA */}
        <Card className="mt-3 overflow-hidden p-0">
          <div className="border-b border-white/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Итого</div>
              <div className="text-xl font-extrabold tracking-tight text-slate-900">{formatKgs(total)}</div>
            </div>
            <div className="mt-1 text-xs text-slate-400">{count} позиц.</div>
          </div>
          <div className="space-y-2 p-4">
            <button
              onClick={() => void submitOrder()}
              disabled={!canSubmit}
              className="w-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-3.5 text-base font-extrabold text-white shadow-[0_12px_28px_rgba(249,115,22,0.38),0_1px_0_rgba(255,255,255,0.22)_inset] transition-all duration-300 hover:shadow-[0_16px_34px_rgba(249,115,22,0.48)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? "Создаем заказ..." : paymentMethod === "bank" ? "К оплате →" : "Оформить заказ →"}
            </button>
            <button
              onClick={() => { if (loading) return; clear(); toast.success("Корзина очищена"); }}
              disabled={loading}
              className="w-full rounded-full border border-black/10 bg-white/60 py-3 text-sm font-semibold text-slate-500 transition-all duration-200 hover:bg-white/80 disabled:opacity-40"
            >
              Очистить корзину
            </button>
          </div>
        </Card>
      </div>

      <ClientNav menuHref={menuHref} />

      {redirectingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/75 backdrop-blur-md">
          <div className="rounded-3xl border border-white/85 bg-white/90 px-8 py-6 shadow-[0_28px_60px_rgba(15,23,42,0.20)] backdrop-blur-2xl">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
            <div className="mt-3 text-center text-sm font-semibold text-slate-700">
              {redirectingTo === "pay" ? "Открываем оплату..." : "Переходим к заказу..."}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
