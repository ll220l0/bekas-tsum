"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ClientNav } from "@/components/ClientNav";
import { useCart } from "@/lib/cartStore";
import {
  addOrderToHistory,
  addSavedAddress,
  clearPendingPayOrderId,
  getOrderHistory,
  getSavedAddresses,
  getSavedLocation,
  getSavedPhone,
  setActiveOrderId,
  setPendingPayOrderId,
  setSavedLocation,
  setSavedPhone,
} from "@/lib/clientPrefs";
import { formatKgs } from "@/lib/money";

type PaymentMethod = "bank" | "cash";
type CreateOrderResponse = { orderId: string; bankPayUrl?: string | null };
const MARKET_OPTIONS = ["Цум", "Гум", "Олд Бишкек", "Берен Голд"] as const;
const OLD_BISHKEK = "Олд Бишкек";

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

function isOldBishkekMarket(market: string) {
  return market === OLD_BISHKEK;
}

function formatSavedAddress(address: { market?: string; line?: string; container?: string }) {
  const isOldBishkek = isOldBishkekMarket(address.market ?? "");
  const parts = [address.market || "Цум"];

  if (!isOldBishkek && address.line) {
    parts.push(`Эт. ${address.line}`);
  }

  if (address.container) {
    parts.push(`Бутик ${address.container}`);
  }

  return parts.join(" | ");
}

const inputClass =
  "w-full rounded-[14px] bg-gray-50 border border-gray-200 px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 transition";

function CartIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 4h2.2l1.2 7.2a2 2 0 0 0 2 1.68h7.9a2 2 0 0 0 1.92-1.43L20 6H7.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="18.5" r="1.4" fill="currentColor" />
      <circle cx="17" cy="18.5" r="1.4" fill="currentColor" />
    </svg>
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
  const [market, setMarket] = useState<(typeof MARKET_OPTIONS)[number]>("Цум");
  const [customerPhone, setCustomerPhone] = useState("");
  const [comment, setComment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank");
  const [loading, setLoading] = useState(false);
  const [redirectingTo, setRedirectingTo] = useState<"pay" | "order" | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<
    Array<{ market: string; line: string; container: string }>
  >([]);
  const submitLockRef = useRef(false);
  const isOldBishkek = isOldBishkekMarket(market);

  useEffect(() => {
    setIsHydrated(true);
    setIdempotencyKey(createIdempotencyKey());
    setCustomerPhone(formatKgPhone(getSavedPhone()));
    const savedLocation = getSavedLocation();
    setMarket(
      MARKET_OPTIONS.includes(savedLocation.market as (typeof MARKET_OPTIONS)[number])
        ? (savedLocation.market as (typeof MARKET_OPTIONS)[number])
        : "Цум",
    );
    setLine(savedLocation.line);
    setContainer(savedLocation.container);
    setSavedAddresses(getSavedAddresses());
  }, []);

  const requestSignature = useMemo(
    () =>
      JSON.stringify({
        restaurantSlug,
        lines: lines.map((item) => ({ id: item.menuItemId, qty: item.qty })),
        market,
        line: line.trim(),
        container: container.trim(),
        customerPhone: normalizeKgPhone(customerPhone.trim()) ?? "",
        paymentMethod,
        comment: comment.trim(),
      }),
    [restaurantSlug, lines, market, line, container, customerPhone, paymentMethod, comment],
  );

  useEffect(() => {
    if (!isHydrated) return;
    setIdempotencyKey(createIdempotencyKey());
  }, [isHydrated, requestSignature]);

  useEffect(() => {
    if (isOldBishkek && line) {
      setLine("");
    }
  }, [isOldBishkek, line]);

  const canSubmit = useMemo(
    () =>
      Boolean(
        isHydrated &&
        restaurantSlug &&
        lines.length > 0 &&
        (isOldBishkek || line.trim().length > 0) &&
        container.trim().length > 0 &&
        normalizeKgPhone(customerPhone) &&
        !loading,
      ),
    [
      container,
      customerPhone,
      isHydrated,
      isOldBishkek,
      line,
      lines.length,
      loading,
      restaurantSlug,
    ],
  );

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
        qty: item.qty,
      }))
      .filter((item) => item.menuItemId.length > 0 && item.qty > 0);
    if (normalizedLines.length === 0) return null;
    return { ...latest, lines: normalizedLines };
  }, [isHydrated]);

  const menuHref = restaurantSlug ? `/r/${restaurantSlug}` : "/";

  if (!isHydrated) {
    return (
      <main className="min-h-screen px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5">
        <div className="mx-auto max-w-md space-y-3">
          <div className="h-10 w-32 rounded-xl skeleton" />
          <div className="h-24 rounded-2xl skeleton" />
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
    if ((!isOldBishkek && !line.trim()) || !container.trim()) {
      toast.error(isOldBishkek ? "Заполните бутик" : "Заполните этаж и бутик");
      return;
    }
    if (!phone) {
      toast.error("Укажите телефон в формате 996 (xxx) xxx - xxx");
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
        location: {
          market,
          line: isOldBishkek ? "" : line.trim(),
          container: container.trim(),
        },
        items: lines.map((item) => ({ menuItemId: item.menuItemId, qty: item.qty })),
        idempotencyKey,
      };

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const payloadJson = (await response.json().catch(() => null)) as
        | (Partial<CreateOrderResponse> & { error?: string })
        | null;
      if (!response.ok || !payloadJson?.orderId) {
        throw new Error(payloadJson?.error ?? "Не удалось создать заказ");
      }

      setIdempotencyKey(createIdempotencyKey());
      addOrderToHistory({
        orderId: payloadJson.orderId,
        restaurantSlug,
        customerPhone: phone,
        totalKgs: total,
        createdAt: new Date().toISOString(),
        lines,
      });
      setActiveOrderId(payloadJson.orderId);
      setSavedPhone(phone);
      const normalizedLine = isOldBishkek ? "" : line.trim();
      setSavedLocation({ market, line: normalizedLine, container: container.trim() });
      addSavedAddress({ market, line: normalizedLine, container: container.trim() });
      clear();

      if (paymentMethod === "bank") {
        setPendingPayOrderId(payloadJson.orderId);
      } else {
        clearPendingPayOrderId();
      }

      const nextUrl =
        paymentMethod === "bank" ? `/pay/${payloadJson.orderId}` : `/order/${payloadJson.orderId}`;
      setRedirectingTo(paymentMethod === "bank" ? "pay" : "order");
      window.setTimeout(() => {
        window.location.assign(nextUrl);
      }, 180);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  }

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
      <main className="min-h-screen px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5">
        <div className="mx-auto max-w-md">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
            Корзина
          </div>
          <h1 className="mt-1 text-3xl font-extrabold text-gray-900">Пусто</h1>

          <div className="mt-6 space-y-3">
            <div className="bg-white rounded-2xl shadow-card p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                <CartIcon className="h-7 w-7" />
              </div>
              <div className="mt-3 font-bold text-gray-900">В корзине пока ничего нет</div>
              <div className="mt-1 text-sm text-gray-500">
                Выберите блюда из меню и вернитесь сюда
              </div>
              <Link
                href={menuHref}
                className="mt-5 block rounded-[14px] bg-orange-500 py-3.5 text-center text-[15px] font-bold text-white shadow-glow"
              >
                Перейти в меню
              </Link>
            </div>

            {lastOrderSuggestion && (
              <div className="bg-white rounded-2xl shadow-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
                    Повторить прошлый заказ
                  </div>
                  <div className="rounded-full bg-orange-50 px-3 py-1 text-sm font-bold text-orange-500">
                    {formatKgs(lastOrderSuggestion.totalKgs)}
                  </div>
                </div>
                <div className="space-y-2 px-5 py-4">
                  {lastOrderSuggestion.lines.map((item) => (
                    <div
                      key={`${item.menuItemId}-${item.title}`}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5"
                    >
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                        <Image
                          src={item.photoUrl}
                          alt={item.title}
                          fill
                          className="object-cover"
                          sizes="44px"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {item.title}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.qty} x {formatKgs(item.priceKgs)}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-orange-500">
                        {formatKgs(item.priceKgs * item.qty)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-5">
                  <button
                    onClick={repeatLastOrder}
                    className="w-full rounded-[14px] bg-orange-500 py-3 text-sm font-bold text-white shadow-glow active:scale-[0.98]"
                  >
                    Повторить заказ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <ClientNav menuHref={menuHref} />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5">
      <div className="mx-auto max-w-md space-y-4">
        {/* 1. Header card */}
        <div className="bg-white rounded-2xl shadow-card px-5 py-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
            Оформление
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <div>
              <h1 className="text-3xl font-extrabold leading-none text-gray-900">Корзина</h1>
              <p className="mt-2 text-sm text-gray-500">
                Проверьте состав заказа и адрес доставки.
              </p>
            </div>
            <div className="pb-1">
              <Link
                href={menuHref}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-500 transition hover:text-gray-900"
              >
                В меню
              </Link>
            </div>
          </div>
        </div>

        {/* 2. Cart items */}
        <div className="space-y-2.5">
          {lines.map((lineItem) => (
            <div
              key={lineItem.menuItemId}
              className="bg-white rounded-2xl shadow-card p-4 flex gap-3.5"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                <Image
                  src={lineItem.photoUrl}
                  alt={lineItem.title}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[14px] font-semibold leading-snug text-gray-900">
                    {lineItem.title}
                  </div>
                  <div className="shrink-0 text-[14px] font-bold text-orange-500">
                    {formatKgs(lineItem.priceKgs * lineItem.qty)}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-[12px] text-gray-400">
                    {formatKgs(lineItem.priceKgs)} x {lineItem.qty}
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-200 px-1 py-1">
                    <button
                      type="button"
                      onClick={() => dec(lineItem.menuItemId)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:text-red-500 transition"
                    >
                      -
                    </button>
                    <span className="min-w-[1.5rem] text-center text-[13px] font-bold text-gray-900">
                      {lineItem.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => inc(lineItem.menuItemId)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white active:scale-90 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 3. Delivery section */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
              Куда доставить
            </div>
          </div>
          <div className="space-y-3 px-5 py-4">
            {savedAddresses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {savedAddresses.map((address, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setMarket(
                        MARKET_OPTIONS.includes(address.market as (typeof MARKET_OPTIONS)[number])
                          ? (address.market as (typeof MARKET_OPTIONS)[number])
                          : "Цум",
                      );
                      setLine(address.line);
                      setContainer(address.container);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      address.market === market &&
                      address.line === line &&
                      address.container === container
                        ? "bg-orange-500 text-white"
                        : "bg-gray-50 text-gray-600 border border-gray-200 hover:text-gray-900"
                    }`}
                  >
                    {formatSavedAddress(address)}
                  </button>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                Торговый центр
              </label>
              <div className="relative">
                <select
                  className={`${inputClass} appearance-none pr-10`}
                  value={market}
                  onChange={(event) =>
                    setMarket(event.target.value as (typeof MARKET_OPTIONS)[number])
                  }
                >
                  {MARKET_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-4 inline-flex items-center text-gray-400">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
                    <path
                      d="M5.5 7.5L10 12L14.5 7.5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </div>

            <div className={`grid gap-2 ${isOldBishkek ? "grid-cols-1" : "grid-cols-2"}`}>
              {!isOldBishkek && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-500">Этаж</label>
                  <input
                    className={inputClass}
                    placeholder="Напр. 2"
                    value={line}
                    onChange={(event) => setLine(event.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-500">Бутик</label>
                <input
                  className={inputClass}
                  placeholder="Напр. A-15"
                  value={container}
                  onChange={(event) => setContainer(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500">Телефон</label>
              <input
                className={inputClass}
                placeholder="996 (___) ___ - ___"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(formatKgPhone(event.target.value))}
                inputMode="tel"
                required
              />
            </div>
          </div>
        </div>

        {/* 4. Comment section */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
              Комментарий
            </div>
          </div>
          <div className="px-5 py-4">
            <textarea
              className={`${inputClass} resize-none`}
              placeholder="Без лука, острее, оставить у охраны..."
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>
        </div>

        {/* 5. Payment method */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
              Способ оплаты
            </div>
          </div>
          <div className="flex gap-2 px-5 py-4">
            {(["bank", "cash"] as const).map((method) => {
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex flex-1 flex-col items-start rounded-[14px] border p-3 text-left transition-all duration-200 ${
                    active
                      ? "bg-orange-50 border-orange-200"
                      : "bg-gray-50 border-gray-200 hover:bg-white"
                  }`}
                >
                  <div
                    className={`text-[15px] font-bold ${active ? "text-orange-600" : "text-gray-900"}`}
                  >
                    {method === "bank" ? "Банком" : "Наличными"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {method === "bank" ? "MBank, O!Bank, Bakai" : "Курьеру при доставке"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Total + CTA */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="text-sm text-gray-500">{count} позиций</div>
            <div className="text-2xl font-extrabold text-gray-900">{formatKgs(total)}</div>
          </div>
          <div className="space-y-2 px-5 py-4">
            <button
              onClick={() => void submitOrder()}
              disabled={!canSubmit}
              className="w-full rounded-[14px] bg-orange-500 py-4 text-[15px] font-bold text-white shadow-glow transition-all duration-200 hover:bg-orange-400 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
            >
              {loading
                ? "Создаём заказ..."
                : paymentMethod === "bank"
                  ? "К оплате"
                  : "Оформить заказ"}
            </button>
            <button
              onClick={() => {
                if (loading) return;
                clear();
                toast.success("Корзина очищена");
              }}
              disabled={loading}
              className="w-full rounded-[14px] bg-gray-50 py-3 text-sm font-semibold text-gray-500 transition-all hover:text-gray-900 disabled:opacity-40"
            >
              Очистить корзину
            </button>
          </div>
        </div>
      </div>

      <ClientNav menuHref={menuHref} />

      {/* 7. Redirecting overlay */}
      {redirectingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm px-6">
          <div className="bg-white rounded-2xl shadow-card px-8 py-6">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <div className="mt-3 text-center text-sm font-semibold text-gray-900">
              {redirectingTo === "pay" ? "Открываем оплату..." : "Переходим к заказу..."}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
