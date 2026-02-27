"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button, Card, Photo, Pill } from "@/components/ui";
import { ClientNav } from "@/components/ClientNav";
import { useCart } from "@/lib/cartStore";
import { formatKgs } from "@/lib/money";

type MenuResp = {
  restaurant: { id: string; name: string; slug: string };
  categories: { id: string; title: string; sortOrder: number }[];
  items: {
    id: string;
    categoryId: string;
    title: string;
    description: string;
    photoUrl: string;
    priceKgs: number;
    isAvailable: boolean;
  }[];
};

async function fetchMenu(slug: string): Promise<MenuResp> {
  const res = await fetch(`/api/restaurants/${slug}/menu`, { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось загрузить меню");
  return res.json();
}

function QtyStepper({ qty, onInc, onDec }: { qty: number; onInc: () => void; onDec: () => void }) {
  const [isPopping, setIsPopping] = useState(false);

  useEffect(() => {
    setIsPopping(true);
    const timer = window.setTimeout(() => setIsPopping(false), 170);
    return () => window.clearTimeout(timer);
  }, [qty]);

  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-gradient-to-br from-white to-slate-50 p-1.5 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
      <button
        type="button"
        onClick={onDec}
        className="h-9 w-9 rounded-xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(190,24,93,0.2)] active:translate-y-0 active:scale-95"
        aria-label="Уменьшить"
      >
        -
      </button>

      <div
        className={`min-w-[3.1rem] rounded-xl border border-black/10 bg-white px-2 py-1 text-center text-sm font-extrabold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-transform duration-200 ${
          isPopping ? "scale-110" : "scale-100"
        }`}
      >
        {qty}
      </div>

      <button
        type="button"
        onClick={onInc}
        className="h-9 w-9 rounded-xl border border-black/10 bg-black text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,23,42,0.3)] active:translate-y-0 active:scale-95"
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
}

export default function MenuScreen({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["menu", slug],
    queryFn: () => fetchMenu(slug),
    refetchInterval: 15000
  });

  const router = useRouter();
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const setRestaurant = useCart((state) => state.setRestaurant);
  const add = useCart((state) => state.add);
  const inc = useCart((state) => state.inc);
  const dec = useCart((state) => state.dec);
  const lines = useCart((state) => state.lines);

  const effectiveSlug = data?.restaurant?.slug ?? slug;

  useEffect(() => {
    setRestaurant(effectiveSlug);
  }, [effectiveSlug, setRestaurant]);

  useEffect(() => {
    if (data?.restaurant?.slug && data.restaurant.slug !== slug) {
      router.replace(`/r/${data.restaurant.slug}`);
    }
  }, [data?.restaurant?.slug, slug, router]);

  useEffect(() => {
    if (data?.categories?.length && !activeCat) setActiveCat(data.categories[0].id);
  }, [data?.categories, activeCat]);

  const qtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line.menuItemId, line.qty);
    return map;
  }, [lines]);

  const items = useMemo(() => {
    if (!data) return [];
    const byCategory = !activeCat ? data.items : data.items.filter((x) => x.categoryId === activeCat);
    return byCategory;
  }, [data, activeCat]);

  function addToCart(item: MenuResp["items"][number]) {
    add({ menuItemId: item.id, title: item.title, photoUrl: item.photoUrl, priceKgs: item.priceKgs });
  }

  return (
    <main className="min-h-screen p-5 pb-44">
      <div className="mx-auto max-w-md">
        <div>
          <div className="text-xs text-black/50">Меню</div>
          <div className="text-3xl font-extrabold tracking-tight">{data?.restaurant?.name ?? "..."}</div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {(data?.categories ?? []).map((c) => (
            <button key={c.id} onClick={() => setActiveCat(c.id)} className="shrink-0">
              <Pill active={c.id === activeCat}>{c.title}</Pill>
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          {isLoading ? (
            <div className="text-sm text-black/50">Загрузка...</div>
          ) : (
            items.map((m) => {
              const qty = qtyByItemId.get(m.id) ?? 0;
              return (
                <Card key={m.id} className="p-3">
                  <div className="flex gap-3">
                    <Photo src={m.photoUrl} alt={m.title} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 font-semibold leading-snug break-words">{m.title}</div>
                        <div className="shrink-0 whitespace-nowrap text-right font-bold">{formatKgs(m.priceKgs)}</div>
                      </div>
                      <div className="mt-1 text-sm text-black/55 break-words">{m.description}</div>

                      <div className="mt-3 flex justify-end">
                        {!m.isAvailable ? (
                          <Button disabled variant="secondary" className="px-4 py-2">
                            Нет в наличии
                          </Button>
                        ) : qty > 0 ? (
                          <QtyStepper qty={qty} onDec={() => dec(m.id)} onInc={() => inc(m.id)} />
                        ) : (
                          <Button onClick={() => addToCart(m)} className="px-4 py-2 transition-transform duration-200 hover:-translate-y-0.5" variant="primary">
                            + Добавить
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          )}

          {!isLoading && items.length === 0 && (
            <Card className="p-4">
              <div className="text-sm text-black/60">В этой категории сейчас нет доступных блюд.</div>
            </Card>
          )}
        </div>
      </div>

      <ClientNav menuHref={`/r/${effectiveSlug}`} />
    </main>
  );
}

