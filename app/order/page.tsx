"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { ClientNav } from "@/components/ClientNav";
import {
  getActiveOrderId,
  getLastOrderId,
  getOrderHistory,
  getPendingPayOrderId,
} from "@/lib/clientPrefs";
import { DEFAULT_RESTAURANT_SLUG } from "@/lib/restaurantConfig";

function ReceiptIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8 4.5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M6 3.5h12v17l-2.2-1.4-1.8 1.4-2-1.4-2 1.4-1.8-1.4L6 20.5v-17z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 9h6M9 12.5h6M9 16h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function OrderHubPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasOrder, setHasOrder] = useState(false);
  const [menuSlug, setMenuSlug] = useState(DEFAULT_RESTAURANT_SLUG);

  useEffect(() => {
    const pendingPayOrderId = getPendingPayOrderId();
    if (pendingPayOrderId) {
      setHasOrder(true);
      router.replace(`/pay/${pendingPayOrderId}`);
      return;
    }

    const activeOrderId = getActiveOrderId();
    if (activeOrderId) {
      setHasOrder(true);
      router.replace(`/order/${activeOrderId}`);
      return;
    }

    const lastOrderId = getLastOrderId();
    const history = getOrderHistory();
    const slug = history[0]?.restaurantSlug || DEFAULT_RESTAURANT_SLUG;

    setMenuSlug(slug);

    if (lastOrderId) {
      setHasOrder(true);
      router.replace(`/order/${lastOrderId}`);
      return;
    }

    setReady(true);
  }, [router]);

  const navMenuHref = useMemo(() => `/r/${menuSlug}`, [menuSlug]);

  if (!ready && hasOrder) {
    return (
      <main className="min-h-screen px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5">
        <div className="mx-auto max-w-md">
          <Card className="px-5 py-5 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <div className="mt-3 text-sm font-semibold text-gray-900">Открываем заказ...</div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5">
      <div className="mx-auto max-w-md space-y-4">
        <Card className="px-5 py-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
            Заказ
          </div>
          <h1 className="mt-1 text-3xl font-extrabold text-gray-900">Нет активных заказов</h1>
          <p className="mt-2 text-sm text-gray-500">
            Когда появится новый заказ, его статус будет доступен здесь.
          </p>
        </Card>

        <Card className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-500">
            <ReceiptIcon className="h-7 w-7" />
          </div>
          <div className="mt-3 font-semibold text-gray-900">Оформите новый заказ в меню</div>
          <div className="mt-1 text-sm text-gray-500">
            История прошлых заказов появится после первой покупки.
          </div>
          <Link
            href={navMenuHref}
            className="mt-5 block rounded-[14px] bg-orange-500 py-3.5 text-center text-sm font-bold text-white shadow-glow transition hover:bg-orange-600"
          >
            Перейти в меню
          </Link>
        </Card>
      </div>

      <ClientNav menuHref={navMenuHref} orderHref="/order" />
    </main>
  );
}
