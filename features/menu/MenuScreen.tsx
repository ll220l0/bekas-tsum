"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
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

type MenuItem = MenuResp["items"][number];

async function fetchMenu(slug: string): Promise<MenuResp> {
  const response = await fetch(`/api/restaurants/${slug}/menu`, { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить меню");
  return response.json();
}

function clamp2(): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden"
  };
}

function QtyStepper({ qty, onInc, onDec }: { qty: number; onInc: () => void; onDec: () => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[#eadcc6] bg-[#fff7ec] px-1 py-1 shadow-[0_10px_24px_-22px_rgba(180,83,9,0.4)]">
      <button
        type="button"
        onClick={onDec}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#9a7a55] transition-colors hover:text-red-500"
        aria-label="Уменьшить"
      >
        -
      </button>
      <span className="min-w-[1.8rem] text-center text-[14px] font-bold text-[#2f2419]">{qty}</span>
      <button
        type="button"
        onClick={onInc}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-base font-bold leading-none text-white shadow-[0_12px_24px_-18px_rgba(249,115,22,0.7)] transition-all active:scale-90"
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
}

function SkeletonItem({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex gap-4 rounded-[28px] border border-[#ecdcc5] bg-white/90 p-4 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]" style={{ animationDelay: `${delay}ms` }}>
      <div className="h-[92px] w-[92px] shrink-0 rounded-[22px] skeleton" />
      <div className="flex-1 space-y-2.5 pt-1">
        <div className="h-[15px] w-[65%] rounded-lg skeleton" />
        <div className="h-[13px] w-[80%] rounded-lg skeleton" />
        <div className="h-[13px] w-[50%] rounded-lg skeleton" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-5 w-20 rounded-lg skeleton" />
          <div className="h-9 w-9 rounded-full skeleton" />
        </div>
      </div>
    </div>
  );
}

function ItemModal({
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
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-[#2a1704]/35" aria-label="Закрыть" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-[32px] border-x border-t border-[#ecdac0] bg-[#fffaf1] shadow-[0_-24px_80px_-40px_rgba(120,53,15,0.4)]"
        style={{ animation: "modal-slide-up 280ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#dcc7a9]" />
        </div>
        <div className="relative mx-4 mt-2 h-56 overflow-hidden rounded-[26px] bg-[#f6ead7]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.photoUrl} alt={item.title} className="h-full w-full object-cover" />
          {!item.isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[26px] bg-white/68 backdrop-blur">
              <span className="rounded-full border border-[#e9d4bf] bg-white/95 px-4 py-2 text-sm font-semibold text-[#8f6e49]">
                Временно недоступно
              </span>
            </div>
          )}
        </div>

        <div className="px-4 pb-8 pt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-black leading-tight tracking-tight text-[#2f2419]">{item.title}</h2>
            <div className="shrink-0 rounded-full bg-[#fff0d6] px-3 py-1 text-lg font-black text-[#b45309]">
              {formatKgs(item.priceKgs)}
            </div>
          </div>
          {item.description ? (
            <p className="mt-2 text-[14px] leading-relaxed text-[#7d6a54]">{item.description}</p>
          ) : null}

          <div className="mt-5">
            {!item.isAvailable ? (
              <div className="flex h-12 items-center justify-center rounded-[22px] border border-[#eadbc4] bg-white text-sm font-semibold text-[#9a7a55]">
                Сейчас недоступно
              </div>
            ) : qty > 0 ? (
              <div className="flex items-center justify-between gap-4">
                <QtyStepper qty={qty} onDec={onDec} onInc={onInc} />
                <button
                  onClick={onClose}
                  className="flex-1 rounded-[22px] bg-orange-500 py-3.5 text-sm font-bold text-white shadow-[0_18px_34px_-24px_rgba(249,115,22,0.7)] active:scale-[0.98]"
                >
                  Готово
                </button>
              </div>
            ) : (
              <button
                onClick={onAdd}
                className="w-full rounded-[22px] bg-orange-500 py-4 text-[15px] font-bold text-white shadow-[0_18px_34px_-24px_rgba(249,115,22,0.7)] active:scale-[0.98]"
              >
                Добавить за {formatKgs(item.priceKgs)}
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
  const cartCount = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);
  const cartTotal = useMemo(() => lines.reduce((sum, line) => sum + line.qty * line.priceKgs, 0), [lines]);

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

  const qtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line.menuItemId, line.qty);
    return map;
  }, [lines]);

  const items = useMemo(() => {
    if (!data) return [];
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      return data.items.filter(
        (item) => item.title.toLowerCase().includes(query) || (item.description ?? "").toLowerCase().includes(query)
      );
    }
    return activeCat ? data.items.filter((item) => item.categoryId === activeCat) : data.items;
  }, [data, activeCat, searchQuery]);

  function addToCart(item: MenuItem) {
    add({
      menuItemId: item.id,
      title: item.title,
      photoUrl: item.photoUrl,
      priceKgs: item.priceKgs
    });
  }

  function handleCatClick(id: string) {
    setActiveCat(id);
    setSearchQuery("");
    const bar = catBarRef.current;
    if (!bar) return;
    const button = bar.querySelector<HTMLElement>(`[data-catid="${id}"]`);
    if (button) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  return (
    <main className="min-h-screen bg-transparent px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-4">
      <div className="mx-auto max-w-md">
        <div className="sticky top-0 z-30 -mx-1 rounded-[34px] border border-[#efdec5] bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(255,246,232,0.94))] px-5 pb-4 pt-5 shadow-[0_24px_60px_-42px_rgba(180,83,9,0.28)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.26em] text-orange-500">
                {isLoading ? <span className="inline-block h-3 w-12 rounded skeleton" /> : "Каталог"}
              </div>
              <h1 className="mt-1 text-[2.55rem] font-black leading-none tracking-[-0.04em] text-[#2f2419]">
                {data?.restaurant?.name ?? (isLoading ? <span className="inline-block h-10 w-48 rounded-xl skeleton" /> : "Ресторан")}
              </h1>
              <p className="mt-2 text-sm text-[#7d6a54]">Свежие блюда с доставкой по контейнерам Дордоя.</p>
            </div>
            {cartCount > 0 && (
              <div className="mt-2 shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-600">
                {cartCount} шт
              </div>
            )}
          </div>

          <div className="relative mt-4">
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#af8d67]" fill="none">
              <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Найти блюдо..."
              className="w-full rounded-[20px] border border-[#eadcc6] bg-white px-10 py-3 text-sm text-[#2f2419] placeholder:text-[#af8d67]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#af8d67] hover:text-[#2f2419]">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {!searchQuery && (
            <div className="relative mt-4" ref={catBarRef}>
              <div className="no-scrollbar flex snap-x gap-2 overflow-x-auto pb-0.5">
                {isLoading
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="h-10 w-20 shrink-0 rounded-full skeleton" />
                    ))
                  : (data?.categories ?? []).map((category) => {
                      const active = category.id === activeCat;
                      return (
                        <button
                          key={category.id}
                          data-catid={category.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => handleCatClick(category.id)}
                          className={`shrink-0 snap-start rounded-full px-4 py-2 text-[13px] font-bold leading-none transition-all duration-200 ${
                            active
                              ? "bg-orange-500 text-white shadow-[0_18px_34px_-24px_rgba(249,115,22,0.65)]"
                              : "border border-[#eadcc6] bg-white text-[#876f51] hover:bg-[#fff6ea] hover:text-[#2f2419]"
                          }`}
                        >
                          {category.title}
                        </button>
                      );
                    })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, index) => <SkeletonItem key={index} delay={index * 60} />)
          ) : isError ? (
            <div className="mt-8 rounded-[28px] border border-[#ecdcc5] bg-white/90 px-6 py-10 text-center shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
              <div className="text-4xl">:(</div>
              <div className="mt-3 font-bold text-[#2f2419]">Не удалось загрузить меню</div>
              <div className="mt-1 text-sm text-[#7d6a54]">Проверьте соединение и обновите страницу</div>
            </div>
          ) : items.length === 0 ? (
            <div className="mt-8 rounded-[28px] border border-[#ecdcc5] bg-white/90 px-6 py-10 text-center shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)]">
              <div className="text-4xl">{searchQuery ? "?" : ":)"}</div>
              <div className="mt-3 text-sm font-semibold text-[#7d6a54]">
                {searchQuery ? `По запросу "${searchQuery}" ничего не найдено` : "В этой категории пока нет блюд"}
              </div>
            </div>
          ) : (
            items.map((item, index) => {
              const qty = qtyMap.get(item.id) ?? 0;
              return (
                <div
                  key={item.id}
                  className="motion-fade-up flex gap-4 rounded-[28px] border border-[#ecdcc5] bg-white/92 p-4 shadow-[0_24px_50px_-34px_rgba(180,83,9,0.22)] transition-transform duration-200 hover:-translate-y-0.5"
                  style={{ animationDelay: `${Math.min(index * 45, 280)}ms` }}
                >
                  <button type="button" onClick={() => setSelectedItem(item)} className="shrink-0 focus:outline-none" aria-label={`Подробнее: ${item.title}`}>
                    <div className="relative h-[92px] w-[92px] overflow-hidden rounded-[22px] bg-[#f6ead7] transition-transform duration-200 active:scale-95">
                      <Image src={item.photoUrl} alt={item.title} fill className="object-cover" sizes="92px" />
                      {!item.isAvailable && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-white/72 backdrop-blur">
                          <span className="px-2 text-center text-[10px] font-bold leading-tight text-[#8f6e49]">НЕТ В НАЛИЧИИ</span>
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <button type="button" onClick={() => setSelectedItem(item)} className="min-w-0 text-left focus:outline-none">
                      <div className="text-[15px] font-bold leading-snug text-[#2f2419]" style={{ ...clamp2(), WebkitLineClamp: 1 }}>
                        {item.title}
                      </div>
                      {item.description ? (
                        <div className="mt-1 text-[13px] leading-snug text-[#7d6a54]" style={clamp2()}>
                          {item.description}
                        </div>
                      ) : null}
                    </button>

                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="rounded-full bg-[#fff0d6] px-3 py-1 text-[15px] font-black text-[#b45309]">
                        {formatKgs(item.priceKgs)}
                      </div>
                      {item.isAvailable &&
                        (qty > 0 ? (
                          <QtyStepper qty={qty} onDec={() => dec(item.id)} onInc={() => inc(item.id)} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-xl font-bold text-white shadow-[0_16px_28px_-18px_rgba(249,115,22,0.7)] active:scale-90"
                            aria-label={`Добавить ${item.title}`}
                          >
                            +
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {cartCount > 0 && (
          <div className="cart-fab-enter fixed bottom-[calc(86px+env(safe-area-inset-bottom))] left-0 right-0 z-30 px-4">
            <div className="mx-auto max-w-md">
              <Link
                href="/cart"
                className="flex h-14 items-center justify-between rounded-[24px] bg-orange-500 px-4 shadow-[0_24px_40px_-24px_rgba(249,115,22,0.75)] hover:bg-orange-400 active:scale-[0.98]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[14px] bg-white/18 text-[13px] font-black text-white">
                  {cartCount}
                </span>
                <span className="font-black tracking-[-0.01em] text-white">Открыть корзину</span>
                <span className="text-[13px] font-bold text-white/85">{formatKgs(cartTotal)}</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      <ClientNav menuHref={`/r/${effectiveSlug}`} />

      {selectedItem && (
        <ItemModal
          item={selectedItem}
          qty={qtyMap.get(selectedItem.id) ?? 0}
          onClose={() => setSelectedItem(null)}
          onAdd={() => addToCart(selectedItem)}
          onInc={() => inc(selectedItem.id)}
          onDec={() => dec(selectedItem.id)}
        />
      )}
    </main>
  );
}
