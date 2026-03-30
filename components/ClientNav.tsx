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

function IconMenu({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M4 11.5h16"
        stroke="currentColor"
        strokeWidth={active ? "2.2" : "1.8"}
        strokeLinecap="round"
      />
      <path
        d="M6.5 11.5a5.5 5.5 0 0 1 11 0v.5h-11z"
        stroke="currentColor"
        strokeWidth={active ? "2.2" : "1.8"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 6.5V5m3.5 1V3.8M15 6.5V5"
        stroke="currentColor"
        strokeWidth={active ? "2.2" : "1.8"}
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCart({ count, active }: { count: number; active: boolean }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path
          d="M3 4h2.2l1.2 7.2a2 2 0 0 0 2 1.68h7.9a2 2 0 0 0 1.92-1.43L20 6H7.1"
          stroke="currentColor"
          strokeWidth={active ? "2" : "1.7"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="18.5" r="1.4" fill="currentColor" />
        <circle cx="17" cy="18.5" r="1.4" fill="currentColor" />
      </svg>
      {count > 0 && (
        <span
          aria-label={`${count} товаров`}
          className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white"
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
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path d="M8 4.5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <rect x="4" y="3" width="16" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M8 8h8M8 12h8M8 16h5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      {hasDot && (
        <span
          aria-hidden="true"
          className={clsx(
            "absolute -right-1 -top-1 h-3 w-3 rounded-full ring-2 ring-[#F5F5F7]",
            dotColor,
          )}
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
              : "/order",
      );
    };

    syncOrderHref();
    const timer = window.setInterval(syncOrderHref, 5000);
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
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pathname, resolvedOrderHref]);

  const hasActiveOrder = activeOrderStatus ? !isHistoryStatus(activeOrderStatus) : false;
  const orderDotColor = getOrderDotColor(activeOrderStatus);

  const isMenu = pathname.startsWith("/r/");
  const isCart = pathname === "/cart";
  const isOrder =
    pathname === "/order" || pathname.startsWith("/order/") || pathname.startsWith("/pay/");

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200/80 bg-white/95 backdrop-blur-lg"
    >
      <div className="mx-auto max-w-md px-4 pb-[env(safe-area-inset-bottom)] pt-2">
        <div className="grid grid-cols-3 items-center">
          <Link
            href={menuHref}
            aria-current={isMenu ? "page" : undefined}
            className={clsx(
              "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[16px] transition-all duration-150",
              isMenu
                ? "bg-orange-50 text-orange-500 shadow-soft"
                : "text-gray-400 hover:bg-gray-50 hover:text-gray-600",
            )}
          >
            <IconMenu active={isMenu} />
            <span className="text-[10px] font-semibold leading-none">Меню</span>
          </Link>

          <Link
            href="/cart"
            aria-current={isCart ? "page" : undefined}
            className={clsx(
              "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[16px] transition-all duration-150",
              isCart
                ? "bg-orange-50 text-orange-500 shadow-soft"
                : "text-gray-400 hover:bg-gray-50 hover:text-gray-600",
            )}
          >
            <IconCart count={cartCount} active={isCart} />
            <span className="text-[10px] font-semibold leading-none">Корзина</span>
          </Link>

          <Link
            href={resolvedOrderHref}
            aria-current={isOrder ? "page" : undefined}
            className={clsx(
              "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[16px] transition-all duration-150",
              isOrder
                ? "bg-orange-50 text-orange-500 shadow-soft"
                : "text-gray-400 hover:bg-gray-50 hover:text-gray-600",
            )}
          >
            <IconOrder hasDot={hasActiveOrder} dotColor={orderDotColor} />
            <span className="text-[10px] font-semibold leading-none">Заказ</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
