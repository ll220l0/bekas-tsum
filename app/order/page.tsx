"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { ClientNav } from "@/components/ClientNav";
import { getActiveOrderId, getLastOrderId, getOrderHistory, getPendingPayOrderId } from "@/lib/clientPrefs";

export default function OrderHubPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasOrder, setHasOrder] = useState(false);
  const [menuSlug, setMenuSlug] = useState("dordoi-food");

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
    const slug = history[0]?.restaurantSlug || "dordoi-food";

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
      <main className="min-h-screen p-5 pb-40">
        <div className="mx-auto max-w-md">
          <Card className="p-4">
            <div className="text-sm text-black/60">Открываем заказ...</div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-5 pb-40">
      <div className="mx-auto max-w-md space-y-4">
        <div className="text-3xl font-extrabold">Заказ</div>
        <Card className="p-4">
          <div className="text-sm text-black/60">Активный заказ</div>
          <div className="mt-2 text-sm text-black/70">Нет активных заказов.</div>
          <div className="mt-3">
            <Link href={navMenuHref} className="block rounded-xl bg-black py-3 text-center font-semibold text-white">
              В меню
            </Link>
          </div>
        </Card>
      </div>

      <ClientNav menuHref={navMenuHref} orderHref="/order" />
    </main>
  );
}