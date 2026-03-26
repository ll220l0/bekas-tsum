"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button, Card, Photo } from "@/components/ui";
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
    const timer = window.setTimeout(() => setIsPopping(false), 200);
    return () => window.clearTimeout(timer);
  }, [qty]);

  return (
    <div className="inline-flex h-11 min-w-[160px] items-center justify-between rounded-full border border-white/85 bg-white/90 px-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.13),0_1px_0_rgba(255,255,255,0.95)_inset] backdrop-blur-sm">
      <button
        type="button"
        onClick={onDec}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-200/80 bg-gradient-to-b from-rose-50 to-rose-100/80 text-lg font-bold leading-none text-rose-600 shadow-[0_3px_10px_rgba(225,29,72,0.15)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(225,29,72,0.22)] active:translate-y-0 active:scale-90"
        aria-label="Уменьшить"
      >
        −
      </button>
      <div
        className={`min-w-[2.4rem] flex-1 px-2 text-center text-[15px] font-extrabold text-slate-900 transition-transform duration-200 ${
          isPopping ? "scale-115" : "scale-100"
        }`}
      >
        {qty}
      </div>
      <button
        type="button"
        onClick={onInc}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-lg font-bold leading-none text-white shadow-[0_4px_12px_rgba(249,115,22,0.38)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(249,115,22,0.45)] active:translate-y-0 active:scale-90"
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
}

function clamp2Style(): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden"
  };
}

function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <Card className="overflow-hidden p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex gap-4">
        <div className="h-[96px] w-[96px] shrink-0 rounded-[22px] skeleton" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="h-4 w-[72%] rounded-full skeleton" />
          <div className="h-3 w-[55%] rounded-full skeleton" />
          <div className="h-3 w-[40%] rounded-full skeleton" />
          <div className="mt-4 h-11 w-[160px] rounded-full skeleton" />
        </div>
      </div>
    </Card>
  );
}

type MenuItem = MenuResp["items"][number];

function ItemDetailModal({
  item,
  qty,
  onClose,
  onAdd,
  onInc,
  onDec
}: {
  item: MenuItem;
  qty: number;
  onClose: () => void;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
}) {
  // Close on backdrop click or Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Закрыть"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-[32px] border border-white/85 bg-white/90 shadow-[0_-20px_60px_rgba(15,23,42,0.22)] backdrop-blur-2xl"
        style={{ animation: "modal-slide-up 280ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-black/15" />
        </div>

        {/* Image */}
        <div className="relative mx-4 mt-1 h-52 overflow-hidden rounded-[22px] bg-black/5 shadow-[0_8px_24px_rgba(15,23,42,0.14)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.photoUrl} alt={item.title} className="h-full w-full object-cover" />
          {!item.isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-black/40 backdrop-blur-sm">
              <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-slate-700">Нет в наличии</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-4 pb-6 pt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-extrabold leading-tight text-slate-900">{item.title}</h2>
            <div className="shrink-0 rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50 to-amber-100/60 px-3 py-1.5 text-base font-extrabold tracking-tight text-amber-700 shadow-[0_3px_10px_rgba(245,158,11,0.14)]">
              {formatKgs(item.priceKgs)}
            </div>
          </div>

          {item.description ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.description}</p>
          ) : null}

          <div className="mt-4">
            {!item.isAvailable ? (
              <div className="flex h-12 items-center justify-center rounded-full border border-slate-200 bg-slate-100/80 text-sm font-semibold text-slate-400">
                Нет в наличии
              </div>
            ) : qty > 0 ? (
              <div className="flex items-center justify-between gap-4">
                <QtyStepper qty={qty} onDec={onDec} onInc={onInc} />
                <button
                  onClick={onClose}
                  className="flex-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(249,115,22,0.32)] active:scale-[0.98]"
                >
                  Готово
                </button>
              </div>
            ) : (
              <button
                onClick={() => { onAdd(); }}
                className="w-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-3.5 text-base font-bold text-white shadow-[0_10px_24px_rgba(249,115,22,0.35),0_1px_0_rgba(255,255,255,0.22)_inset] active:scale-[0.98]"
              >
                + Добавить в корзину
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MenuScreen({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["menu", slug],
    queryFn: () => fetchMenu(slug),
    refetchInterval: 15000
  });

  const router = useRouter();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const catBarRef = useRef<HTMLDivElement>(null);

  const setRestaurant = useCart((state) => state.setRestaurant);
  const add = useCart((state) => state.add);
  const inc = useCart((state) => state.inc);
  const dec = useCart((state) => state.dec);
  const lines = useCart((state) => state.lines);

  const effectiveSlug = data?.restaurant?.slug ?? slug;

  const cartCount = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);
  const cartTotal = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.priceKgs, 0), [lines]);

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
    let base = !activeCat || searchQuery.trim()
      ? data.items
      : data.items.filter((item) => item.categoryId === activeCat);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      base = base.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q)
      );
    }
    return base;
  }, [data, activeCat, searchQuery]);

  function addToCart(item: MenuResp["items"][number]) {
    add({ menuItemId: item.id, title: item.title, photoUrl: item.photoUrl, priceKgs: item.priceKgs });
  }

  function scrollCatIntoView(id: string) {
    const bar = catBarRef.current;
    if (!bar) return;
    const btn = bar.querySelector<HTMLElement>(`[data-catid="${id}"]`);
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function handleCatClick(id: string) {
    setActiveCat(id);
    setSearchQuery("");
    scrollCatIntoView(id);
  }

  return (
    <main className="min-h-screen px-4 pb-52 pt-4 sm:px-5">
      <div className="mx-auto max-w-md">

        {/* ── Header Island ── */}
        <section className="sticky top-2 z-30 overflow-hidden rounded-[28px] border border-white/85 bg-white/70 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.14),0_1.5px_0_rgba(255,255,255,0.95)_inset,0_0_0_0.5px_rgba(255,255,255,0.55)_inset] backdrop-blur-2xl">

          {/* Specular shimmer stripe */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-500/80">Меню</div>
              <div className="mt-0.5 text-[1.9rem] font-extrabold leading-none tracking-tight text-slate-900">
                {data?.restaurant?.name ?? (isLoading ? <span className="inline-block h-8 w-48 rounded-xl skeleton" /> : "—")}
              </div>
            </div>
            {cartCount > 0 && (
              <div className="shrink-0 rounded-full border border-orange-300/40 bg-gradient-to-r from-orange-500 to-amber-400 px-3 py-1 text-xs font-bold text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
                {cartCount} шт
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="relative mt-3">
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Найти блюдо..."
              className="w-full rounded-xl border border-black/8 bg-white/80 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
            />
          </div>

          {/* Category pills */}
          {!searchQuery.trim() && (
            <div className="relative mt-3" ref={catBarRef}>
              <div className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-0.5">
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-9 w-20 shrink-0 rounded-full skeleton" />
                    ))
                  : (data?.categories ?? []).map((cat) => {
                      const isActive = cat.id === activeCat;
                      return (
                        <button
                          key={cat.id}
                          data-catid={cat.id}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => handleCatClick(cat.id)}
                          className={`shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold leading-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            isActive
                              ? "bg-gradient-to-r from-orange-500 to-amber-400 text-white shadow-[0_6px_16px_rgba(249,115,22,0.32),0_1px_0_rgba(255,255,255,0.2)_inset] border border-orange-400/20"
                              : "border border-black/8 bg-white/80 text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:bg-white hover:shadow-[0_4px_12px_rgba(15,23,42,0.09)]"
                          }`}
                        >
                          {cat.title}
                        </button>
                      );
                    })}
              </div>
            </div>
          )}
        </section>

        {/* ── Menu Items ── */}
        <div className="mt-3.5 space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} delay={i * 60} />)
          ) : isError ? (
            <Card className="p-6 text-center">
              <div className="text-2xl">😔</div>
              <div className="mt-2 font-semibold text-slate-700">Не удалось загрузить меню</div>
              <div className="mt-1 text-sm text-slate-500">Проверьте соединение и обновите страницу</div>
            </Card>
          ) : items.length === 0 ? (
            <Card className="p-6 text-center">
              <div className="text-2xl">{searchQuery ? "🔍" : "🍽"}</div>
              <div className="mt-2 text-sm font-medium text-slate-500">
                {searchQuery ? `Ничего не найдено по запросу «${searchQuery}»` : "В этой категории пока нет блюд"}
              </div>
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="mt-2 text-sm font-semibold text-orange-500">
                  Сбросить поиск
                </button>
              )}
            </Card>
          ) : (
            items.map((item, index) => {
              const qty = qtyByItemId.get(item.id) ?? 0;
              const animDelay = `${Math.min(index * 50, 300)}ms`;

              return (
                <Card
                  key={item.id}
                  className="motion-fade-up overflow-hidden p-4 hover:-translate-y-0.5 hover:shadow-[0_26px_60px_rgba(15,23,42,0.17),0_1.5px_0_rgba(255,255,255,0.95)_inset]"
                  style={{ animationDelay: animDelay }}
                >
                  <div className="flex gap-4">
                    {/* Clickable photo → opens modal */}
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="shrink-0 focus:outline-none"
                      aria-label={`Подробнее: ${item.title}`}
                    >
                      <Photo
                        src={item.photoUrl}
                        alt={item.title}
                        className="h-[96px] w-[96px] rounded-[22px] shadow-[0_8px_20px_rgba(15,23,42,0.12)] transition-transform duration-200 active:scale-95"
                        sizes="96px"
                      />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        {/* Clickable title → opens modal */}
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="min-w-0 text-left text-[15px] font-bold leading-snug text-slate-900 focus:outline-none"
                          style={clamp2Style()}
                        >
                          {item.title}
                        </button>
                        <div className="shrink-0 rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50 to-amber-100/60 px-2.5 py-1.5 text-[13px] font-extrabold tracking-tight text-amber-700 shadow-[0_3px_10px_rgba(245,158,11,0.14)]">
                          {formatKgs(item.priceKgs)}
                        </div>
                      </div>

                      {item.description ? (
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="mt-1 text-left text-[13px] leading-snug text-slate-400 focus:outline-none"
                          style={clamp2Style()}
                        >
                          {item.description}
                        </button>
                      ) : null}

                      <div className="mt-3 flex min-h-[44px] items-center justify-end">
                        {!item.isAvailable ? (
                          <span className="inline-flex h-11 min-w-[160px] items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/80 px-4 text-[13px] font-semibold text-slate-400">
                            Нет в наличии
                          </span>
                        ) : qty > 0 ? (
                          <QtyStepper qty={qty} onDec={() => dec(item.id)} onInc={() => inc(item.id)} />
                        ) : (
                          <Button
                            variant="food"
                            onClick={() => addToCart(item)}
                            className="h-11 min-w-[160px] rounded-full px-5 text-[14px] font-bold"
                          >
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
        </div>
      </div>

      {/* ── Floating Cart FAB ── */}
      {cartCount > 0 && (
        <div className="cart-fab-enter fixed bottom-[80px] left-1/2 z-30 w-full max-w-xs -translate-x-1/2 px-4">
          <Link
            href="/cart"
            className="flex h-14 w-full items-center justify-between gap-3 rounded-full border border-orange-400/25 bg-gradient-to-r from-orange-500 to-amber-400 px-2 pr-5 shadow-[0_16px_40px_rgba(249,115,22,0.42),0_1.5px_0_rgba(255,255,255,0.25)_inset] transition-all duration-300 hover:shadow-[0_22px_50px_rgba(249,115,22,0.50)] active:scale-[0.97]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-[15px] font-extrabold text-white shadow-inner">
              {cartCount}
            </span>
            <span className="flex-1 text-center text-[15px] font-extrabold tracking-tight text-white">
              Перейти в корзину
            </span>
            <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-[13px] font-bold text-white">
              {formatKgs(cartTotal)}
            </span>
          </Link>
        </div>
      )}

      <ClientNav menuHref={`/r/${effectiveSlug}`} />

      {/* ── Item Detail Modal ── */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          qty={qtyByItemId.get(selectedItem.id) ?? 0}
          onClose={() => setSelectedItem(null)}
          onAdd={() => addToCart(selectedItem)}
          onInc={() => inc(selectedItem.id)}
          onDec={() => dec(selectedItem.id)}
        />
      )}
    </main>
  );
}
