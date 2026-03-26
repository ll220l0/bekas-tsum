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
  setSavedPhone
} from "@/lib/clientPrefs";
import { formatKgs } from "@/lib/money";

type PaymentMethod = "bank" | "cash";
type CreateOrderResponse = { orderId: string; bankPayUrl?: string | null };

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

const inputClass =
  "w-full rounded-[20px] border border-[#eadcc6] bg-white px-4 py-3 text-sm text-[#2f2419] placeholder:text-[#af8d67]";

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
        lines: lines.map((item) => ({ id: item.menuItemId, qty: item.qty })),
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

  const canSubmit = useMemo(
    () =>
      Boolean(
        isHydrated &&
          restaurantSlug &&
          lines.length > 0 &&
          line.trim().length > 0 &&
          container.trim().length > 0 &&
          normalizeKgPhone(customerPhone) &&
          !loading
      ),
    [container, customerPhone, isHydrated, line, lines.length, loading, restaurantSlug]
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
        qty: item.qty
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
          <div className="h-24 rounded-[26px] skeleton" />
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
      toast.error("Заполните проход и контейнер");
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
        location: { line: line.trim(), container: container.trim() },
        items: lines.map((item) => ({ menuItemId: item.menuItemId, qty: item.qty })),
        idempotencyKey
      };

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": idempotencyKey
        },
        body: JSON.stringify(payload)
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
        lines
      });
      setActiveOrderId(payloadJson.orderId);
      setSavedPhone(phone);
      setSavedLocation({ line: line.trim(), container: container.trim() });
      addSavedAddress({ line: line.trim(), container: container.trim() });
      clear();

      if (paymentMethod === "bank") {
        setPendingPayOrderId(payloadJson.orderId);
      } else {
        clearPendingPayOrderId();
      }

      const nextUrl = paymentMethod === "bank" ? `/pay/${payloadJson.orderId}` : `/order/${payloadJson.orderId}`;
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
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-orange-500">Корзина</div>
          <h1 className="mt-1 text-[2.45rem] font-black tracking-[-0.04em] text-[#2f2419]">Пусто</h1>

          <div className="mt-6 space-y-3">
            <div className="rounded-[30px] border border-[#ecdcc5] bg-white/92 p-6 text-center shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
              <div className="text-4xl">+</div>
              <div className="mt-3 font-bold text-[#2f2419]">В корзине пока ничего нет</div>
              <div className="mt-1 text-sm text-[#7d6a54]">Выберите блюда из меню и вернитесь сюда</div>
              <Link
                href={menuHref}
                className="mt-5 block rounded-[22px] bg-orange-500 py-3.5 text-center text-[15px] font-bold text-white shadow-[0_18px_34px_-24px_rgba(249,115,22,0.7)]"
              >
                Перейти в меню
              </Link>
            </div>

            {lastOrderSuggestion && (
              <div className="overflow-hidden rounded-[30px] border border-[#ecdcc5] bg-white/92 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
                <div className="flex items-center justify-between border-b border-[#f1e4d0] px-5 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">Повторить прошлый заказ</div>
                  <div className="rounded-full bg-[#fff0d6] px-3 py-1 text-sm font-black text-[#b45309]">
                    {formatKgs(lastOrderSuggestion.totalKgs)}
                  </div>
                </div>
                <div className="space-y-2 px-5 py-4">
                  {lastOrderSuggestion.lines.map((item) => (
                    <div key={`${item.menuItemId}-${item.title}`} className="flex items-center gap-3 rounded-[20px] border border-[#f0e1ca] bg-[#fff8ee] p-2.5">
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[14px] bg-[#f6ead7]">
                        <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="44px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[#2f2419]">{item.title}</div>
                        <div className="text-xs text-[#8c7557]">
                          {item.qty} x {formatKgs(item.priceKgs)}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-[#b45309]">{formatKgs(item.priceKgs * item.qty)}</div>
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-5">
                  <button
                    onClick={repeatLastOrder}
                    className="w-full rounded-[22px] bg-orange-500 py-3 text-sm font-bold text-white shadow-[0_18px_34px_-24px_rgba(249,115,22,0.7)] active:scale-[0.98]"
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
        <div className="rounded-[32px] border border-[#efdec5] bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(255,246,232,0.94))] px-5 py-5 shadow-[0_24px_60px_-42px_rgba(180,83,9,0.28)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-orange-500">Оформление</div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <div>
              <h1 className="text-[2.45rem] font-black leading-none tracking-[-0.04em] text-[#2f2419]">Корзина</h1>
              <p className="mt-2 text-sm text-[#7d6a54]">Проверьте состав заказа и адрес доставки.</p>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-600">
                {count} шт
              </span>
              <Link href={menuHref} className="rounded-full border border-[#eadcc6] bg-white px-3 py-1 text-xs font-semibold text-[#7d6a54] hover:text-[#2f2419]">
                В меню
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {lines.map((lineItem) => (
            <div key={lineItem.menuItemId} className="flex gap-3.5 rounded-[28px] border border-[#ecdcc5] bg-white/92 p-4 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[18px] bg-[#f6ead7]">
                <Image src={lineItem.photoUrl} alt={lineItem.title} fill className="object-cover" sizes="64px" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[14px] font-semibold leading-snug text-[#2f2419]">{lineItem.title}</div>
                  <div className="shrink-0 rounded-full bg-[#fff0d6] px-3 py-1 text-[14px] font-black text-[#b45309]">
                    {formatKgs(lineItem.priceKgs * lineItem.qty)}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-[12px] text-[#8c7557]">
                    {formatKgs(lineItem.priceKgs)} x {lineItem.qty}
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-[#eadcc6] bg-[#fff8ee] px-1 py-1">
                    <button type="button" onClick={() => dec(lineItem.menuItemId)} className="flex h-6 w-6 items-center justify-center rounded-full text-[#9a7a55] hover:text-red-500">
                      -
                    </button>
                    <span className="min-w-[1.5rem] text-center text-[13px] font-bold text-[#2f2419]">{lineItem.qty}</span>
                    <button type="button" onClick={() => inc(lineItem.menuItemId)} className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white active:scale-90">
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-[30px] border border-[#ecdcc5] bg-white/92 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
          <div className="border-b border-[#f1e4d0] px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">Куда доставить</div>
          </div>
          <div className="space-y-3 px-5 py-4">
            {savedAddresses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {savedAddresses.map((address, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setLine(address.line);
                      setContainer(address.container);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                      address.line === line && address.container === container
                        ? "border-orange-500 bg-orange-500 text-white shadow-[0_14px_28px_-22px_rgba(249,115,22,0.7)]"
                        : "border-[#eadcc6] bg-[#fff8ee] text-[#7d6a54] hover:text-[#2f2419]"
                    }`}
                  >
                    {address.line ? `Пр. ${address.line}` : ""}
                    {address.line && address.container ? ", " : ""}
                    {address.container ? `К. ${address.container}` : ""}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#8c7557]">Проход</label>
                <input className={inputClass} placeholder="Напр. 12" value={line} onChange={(event) => setLine(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#8c7557]">Контейнер</label>
                <input className={inputClass} placeholder="Напр. А-15" value={container} onChange={(event) => setContainer(event.target.value)} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#8c7557]">Телефон</label>
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

        <div className="overflow-hidden rounded-[30px] border border-[#ecdcc5] bg-white/92 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
          <div className="border-b border-[#f1e4d0] px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">Комментарий</div>
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

        <div className="overflow-hidden rounded-[30px] border border-[#ecdcc5] bg-white/92 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
          <div className="border-b border-[#f1e4d0] px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">Способ оплаты</div>
          </div>
          <div className="flex gap-2 px-5 py-4">
            {(["bank", "cash"] as const).map((method) => {
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex flex-1 flex-col items-start rounded-[22px] border p-3 text-left transition-all duration-200 ${
                    active
                      ? "border-orange-300 bg-orange-50 shadow-[0_18px_32px_-24px_rgba(249,115,22,0.45)]"
                      : "border-[#eadcc6] bg-[#fff8ee] hover:bg-white"
                  }`}
                >
                  <div className={`text-[15px] font-black ${active ? "text-orange-600" : "text-[#3b2f21]"}`}>
                    {method === "bank" ? "Банком" : "Наличными"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#8c7557]">
                    {method === "bank" ? "MBank, O!Bank, Bakai" : "Курьеру при доставке"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[30px] border border-[#ecdcc5] bg-white/92 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
          <div className="flex items-center justify-between border-b border-[#f1e4d0] px-5 py-4">
            <div className="text-sm text-[#8c7557]">{count} позиций</div>
            <div className="text-[1.65rem] font-black tracking-tight text-[#2f2419]">{formatKgs(total)}</div>
          </div>
          <div className="space-y-2 px-5 py-4">
            <button
              onClick={() => void submitOrder()}
              disabled={!canSubmit}
              className="w-full rounded-[22px] bg-orange-500 py-4 text-[15px] font-black text-white shadow-[0_18px_34px_-24px_rgba(249,115,22,0.7)] transition-all duration-200 hover:bg-orange-400 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
            >
              {loading ? "Создаём заказ..." : paymentMethod === "bank" ? "К оплате" : "Оформить заказ"}
            </button>
            <button
              onClick={() => {
                if (loading) return;
                clear();
                toast.success("Корзина очищена");
              }}
              disabled={loading}
              className="w-full rounded-[22px] border border-[#eadcc6] bg-[#fff8ee] py-3 text-sm font-semibold text-[#7d6a54] transition-all hover:text-[#2f2419] disabled:opacity-40"
            >
              Очистить корзину
            </button>
          </div>
        </div>
      </div>

      <ClientNav menuHref={menuHref} />

      {redirectingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2a1704]/28 px-6">
          <div className="rounded-[28px] border border-[#ecdcc5] bg-white px-8 py-6 shadow-[0_30px_70px_-36px_rgba(120,53,15,0.4)]">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <div className="mt-3 text-center text-sm font-semibold text-[#3b2f21]">
              {redirectingTo === "pay" ? "Открываем оплату..." : "Переходим к заказу..."}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
