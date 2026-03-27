"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card } from "@/components/ui";

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  mbankNumber: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ошибка";
}

export default function AdminBanksPage() {
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [mbankNumber, setMbankNumber] = useState("");
  const [bankPassword, setBankPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRestaurant = useCallback(async () => {
    const res = await fetch("/api/admin/restaurants", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { restaurants?: Restaurant[] };
    const first = json.restaurants?.[0];
    if (!first) return;
    setRestaurantSlug(first.slug);
    setMbankNumber(first.mbankNumber ?? "");
  }, []);

  useEffect(() => {
    void loadRestaurant();
  }, [loadRestaurant]);

  async function saveNumbers() {
    if (!restaurantSlug || !bankPassword.trim()) {
      toast.error("Введите пароль для смены номера");
      return;
    }

    const mbank = mbankNumber.replace(/[^\d]/g, "");
    const numberRe = /^996\d{9}$/;
    if (mbank && !numberRe.test(mbank)) {
      toast.error("Формат номера: 996XXXXXXXXX");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/restaurants", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: restaurantSlug,
          mbankNumber: mbank,
          bankPassword: bankPassword.trim()
        })
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Не удалось сохранить номер");

      toast.success("Номер Mbank сохранен");
      setBankPassword("");
      await loadRestaurant();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-black/50">Админка</div>
            <div className="text-3xl font-extrabold">Реквизиты</div>
          </div>
          <Link className="text-sm text-black/60 underline" href="/admin">
            Назад
          </Link>
        </div>

        <Card className="mt-5 p-4">
          <div className="text-sm font-semibold">Номер Mbank</div>
          <div className="mt-2 text-xs text-black/55">
            Укажите номер в формате 996XXXXXXXXX. Для сохранения нужен текущий пароль
            владельца из админки.
          </div>

          <input
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-3"
            type="text"
            inputMode="numeric"
            placeholder="Mbank номер (996XXXXXXXXX)"
            value={mbankNumber}
            onChange={(e) => setMbankNumber(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
          />

          <input
            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-3"
            type="password"
            autoComplete="current-password"
            placeholder="Текущий пароль владельца"
            value={bankPassword}
            onChange={(e) => setBankPassword(e.target.value)}
          />

          <Button className="mt-3 w-full" disabled={!restaurantSlug || !bankPassword.trim() || saving} onClick={() => void saveNumbers()}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </Button>
        </Card>
      </div>
    </main>
  );
}

