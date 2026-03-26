"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cartStore";
import { getActiveOrderId, getLastOrderId, getPendingPayOrderId } from "@/lib/clientPrefs";
import { isHistoryStatus } from "@/lib/orderStatus";

type Props = {
  menuHref: string;
  orderHref?: string | null;
};

function extractOrderId(href: string) {
  const match = href.match(/^\/(?:order|pay)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function getOrderDotColor(status: string | null) {
  switch (status) {
    case "confirmed":
      return "bg-emerald-500";
    case "cooking":
      return "bg-violet-500";
    case "delivering":
      return "bg-sky-500";
    case "canceled":
      return "bg-red-500";
    case "delivered":
      return "bg-emerald-400";
    default:
      return "bg-amber-400";
  }
}

function IconMenu() {
  return (
    <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" fill="none" aria-hidden="true">
      <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconCart({ count }: { count: number }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" fill="none" aria-hidden="true">
        <path
          d="M2 3.5h2.5l2.2 8.5h9l1.8-6.5H6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="17.5" r="1.3" fill="currentColor" />
        <circle cx="14.5" cy="17.5" r="1.3" fill="currentColor" />
      </svg>
      {count > 0 && (
        <span
          aria-label={`${count} товаров`}
          className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-black text-white"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </div>
  );
}

function IconOrder({ hasDot, dotColor }: { hasDot: boolean; dotColor: string }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" fill="none" aria-hidden="true">
        <rect x="3.5" y="2" width="15" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.5 8h7M7.5 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {hasDot && (
        <span
          aria-hidden="true"
          className={clsx("absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white", dotColor)}
        />
      )}
    </div>
  );
}

export function ClientNav({ menuHref, orderHref }: Props) {
  const pathname = usePathname();
  const lines = useCart((state) => state.lines);
  const cartCount = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);
  const [fallbackOrderHref, setFallbackOrderHref] = useState("/order");
  const [activeOrderStatus, setActiveOrderStatus] = useState<string | null>(null);

  const resolvedOrderHref = orderHref ?? fallbackOrderHref;

  useEffect(() => {
    if (orderHref) return;

    const syncOrderHref = () => {
      const pendingPayOrderId = getPendingPayOrderId();
      const activeOrderId = getActiveOrderId();
      const lastOrderId = getLastOrderId();

      setFallbackOrderHref(
        pendingPayOrderId
          ? `/pay/${pendingPayOrderId}`
          : activeOrderId
            ? `/order/${activeOrderId}`
            : lastOrderId
              ? `/order/${lastOrderId}`
              : "/order"
      );
    };

    syncOrderHref();
    const timer = window.setInterval(syncOrderHref, 1500);
    const onFocus = () => syncOrderHref();
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncOrderHref();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "dordoi_pending_pay_order_id" || event.key === "dordoi_active_order_id") {
        syncOrderHref();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [orderHref]);

  useEffect(() => {
    let stopped = false;
    const orderIdFromPath = extractOrderId(pathname);
    const orderId = orderIdFromPath ?? extractOrderId(resolvedOrderHref);

    if (!orderId) {
      setActiveOrderStatus(null);
      return;
    }

    const load = async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { status?: string };
        if (!stopped) setActiveOrderStatus(payload.status ?? null);
      } catch {
        // Ignore network hiccups, nav badge is best-effort.
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pathname, resolvedOrderHref]);

  const hasActiveOrder = activeOrderStatus ? !isHistoryStatus(activeOrderStatus) : false;
  const orderDotColor = getOrderDotColor(activeOrderStatus);

  const isMenu = pathname.startsWith("/r/");
  const isCart = pathname === "/cart";
  const isOrder = pathname === "/order" || pathname.startsWith("/order/") || pathname.startsWith("/pay/");

  const tabClass = (active: boolean) =>
    clsx(
      "relative flex flex-col items-center gap-0.5 rounded-[18px] px-5 py-2.5 transition-all duration-200",
      active
        ? "bg-[#fff4df] text-orange-500 shadow-[0_14px_30px_-24px_rgba(249,115,22,0.55)]"
        : "text-[#8e7c66] hover:bg-[#fff8ef] hover:text-[#2f2419]"
    );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)]">
      <div className="mx-auto max-w-md rounded-[26px] border border-[#ecd9bc] bg-white/92 px-2 py-2 shadow-[0_26px_60px_-34px_rgba(190,120,43,0.38)] backdrop-blur">
        <div className="flex items-center justify-around">
          <Link href={menuHref} className={tabClass(isMenu)}>
            <IconMenu />
            <span className="text-[10px] font-semibold tracking-wide">Меню</span>
          </Link>

          <Link href="/cart" className={tabClass(isCart)}>
            <IconCart count={cartCount} />
            <span className="text-[10px] font-semibold tracking-wide">Корзина</span>
          </Link>

          <Link href={resolvedOrderHref} className={tabClass(isOrder)}>
            <IconOrder hasDot={hasActiveOrder} dotColor={orderDotColor} />
            <span className="text-[10px] font-semibold tracking-wide">Заказ</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
