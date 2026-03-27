"use client";

import Image from "next/image";
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
type DrinkVariant = MenuItem & { variantLabel: string };
type MenuDisplayEntry =
  | { type: "item"; item: MenuItem }
  | {
      type: "drink-group";
      key: string;
      title: string;
      description: string;
      photoUrl: string;
      variants: DrinkVariant[];
    };

const preloadedImages = new Set<string>();
const BRAND_LOGO_SRC = "/brand/bekas-burger-logo.jpg";
const DRINKS_CATEGORY_TITLE = "Напитки";
const DRINK_VARIANT_SUFFIX_RE = /\s+(1,5л|1л|0,5л|ж\/б)$/i;

async function fetchMenu(slug: string): Promise<MenuResp> {
  const response = await fetch(`/api/restaurants/${slug}/menu`, { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить меню");
  return response.json();
}

function warmImage(src: string) {
  if (typeof window === "undefined" || !src || preloadedImages.has(src)) return;
  preloadedImages.add(src);
  const image = new window.Image();
  image.decoding = "async";
  image.src = src;
}

function clamp2(): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

function getDrinkVariantMeta(title: string) {
  const match = title.match(DRINK_VARIANT_SUFFIX_RE);
  if (!match) return null;

  return {
    baseTitle: title.slice(0, -match[0].length).trim(),
    variantLabel: match[1].toLowerCase() === "ж/б" ? "ж/б" : match[1],
  };
}

function getDrinkVariantSortOrder(label: string) {
  if (label === "0,5л") return 0;
  if (label === "1л") return 1;
  if (label === "1,5л") return 2;
  if (label === "ж/б") return 3;
  return 9;
}

function formatPriceRange(prices: number[]) {
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  if (minPrice === maxPrice) return formatKgs(minPrice);
  return `от ${formatKgs(minPrice)}`;
}

function QtyStepper({ qty, onInc, onDec }: { qty: number; onInc: () => void; onDec: () => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-1 py-1">
      <button
        type="button"
        onClick={onDec}
        className="flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-colors hover:text-red-500"
        aria-label="Уменьшить"
      >
        -
      </button>
      <span className="min-w-[1.8rem] text-center text-[14px] font-bold text-gray-900">{qty}</span>
      <button
        type="button"
        onClick={onInc}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-base font-bold leading-none text-white shadow-[0_4px_12px_-4px_rgba(249,115,22,0.5)] transition-all active:scale-90"
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
}

function SkeletonItem({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="flex gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="h-[100px] w-[100px] shrink-0 rounded-xl bg-gray-100 skeleton" />
      <div className="flex-1 space-y-2.5 pt-1">
        <div className="h-[15px] w-[65%] rounded-lg bg-gray-100 skeleton" />
        <div className="h-[13px] w-[80%] rounded-lg bg-gray-100 skeleton" />
        <div className="h-[13px] w-[50%] rounded-lg bg-gray-100 skeleton" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-5 w-20 rounded-lg bg-gray-100 skeleton" />
          <div className="h-10 w-10 rounded-full bg-gray-100 skeleton" />
        </div>
      </div>
    </div>
  );
}

function DrinkGroupCard({
  title,
  description,
  photoUrl,
  variants,
  animationDelay,
  qtyMap,
  onOpen,
  onAdd,
  onInc,
  onDec,
}: {
  title: string;
  description: string;
  photoUrl: string;
  variants: DrinkVariant[];
  animationDelay: number;
  qtyMap: Map<string, number>;
  onOpen: (item: MenuItem) => void;
  onAdd: (item: MenuItem) => void;
  onInc: (itemId: string) => void;
  onDec: (itemId: string) => void;
}) {
  return (
    <div
      className="motion-fade-up rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)] transition-transform duration-200 hover:-translate-y-0.5"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex gap-4">
        <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-xl bg-gray-100">
          <Image src={photoUrl} alt={title} fill className="object-cover" sizes="100px" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold leading-snug text-gray-900">{title}</h3>
              <p className="mt-1 text-[13px] leading-snug text-gray-500">{description}</p>
            </div>
            <div className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-sm font-bold text-orange-500">
              {formatPriceRange(variants.map((variant) => variant.priceKgs))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {variants.map((variant) => {
          const qty = qtyMap.get(variant.id) ?? 0;

          return (
            <div
              key={variant.id}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 ${
                variant.isAvailable ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-gray-100/80"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(variant)}
                onMouseEnter={() => warmImage(variant.photoUrl)}
                onTouchStart={() => warmImage(variant.photoUrl)}
                onFocus={() => warmImage(variant.photoUrl)}
                className="min-w-0 flex-1 text-left focus:outline-none"
                aria-label={`Подробнее: ${title}, ${variant.variantLabel}`}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                    {variant.variantLabel}
                  </span>
                  {!variant.isAvailable ? (
                    <span className="text-[11px] font-semibold text-gray-400">нет в наличии</span>
                  ) : null}
                </div>
                {variant.description ? (
                  <div
                    className="mt-1 text-[12px] leading-snug text-gray-500"
                    style={{ ...clamp2(), WebkitLineClamp: 1 }}
                  >
                    {variant.description}
                  </div>
                ) : null}
              </button>

              <div className="flex shrink-0 items-center gap-3">
                <div className="text-sm font-bold text-orange-500">{formatKgs(variant.priceKgs)}</div>
                {variant.isAvailable ? (
                  qty > 0 ? (
                    <QtyStepper qty={qty} onDec={() => onDec(variant.id)} onInc={() => onInc(variant.id)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAdd(variant)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-xl font-bold text-white shadow-[0_4px_12px_-4px_rgba(249,115,22,0.5)] active:scale-90"
                      aria-label={`Добавить ${title}, ${variant.variantLabel}`}
                    >
                      +
                    </button>
                  )
                ) : (
                  <div className="rounded-full bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                    скоро
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
  onDec,
}: {
  item: MenuItem;
  qty: number;
  onClose: () => void;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

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

  useEffect(() => {
    setImageLoaded(false);
    warmImage(item.photoUrl);
  }, [item.photoUrl]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white"
        style={{ animation: "modal-slide-up 280ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
        <div className="relative mx-4 mt-2 h-56 overflow-hidden rounded-2xl bg-gray-100">
          {!imageLoaded ? <div className="absolute inset-0 skeleton bg-gray-200" /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photoUrl}
            alt={item.title}
            className={`h-full w-full object-cover transition-opacity duration-200 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onLoad={() => setImageLoaded(true)}
          />
          {!item.isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur">
              <span className="rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-sm font-semibold text-gray-500">
                Временно недоступно
              </span>
            </div>
          )}
        </div>

        <div className="px-4 pb-8 pt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold leading-tight text-gray-900">{item.title}</h2>
            <div className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-lg font-bold text-orange-500">
              {formatKgs(item.priceKgs)}
            </div>
          </div>
          {item.description ? (
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{item.description}</p>
          ) : null}

          <div className="mt-5">
            {!item.isAvailable ? (
              <div className="flex h-12 items-center justify-center rounded-[14px] border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-400">
                Сейчас недоступно
              </div>
            ) : qty > 0 ? (
              <div className="flex items-center justify-between gap-4">
                <QtyStepper qty={qty} onDec={onDec} onInc={onInc} />
                <button
                  onClick={onClose}
                  className="flex-1 rounded-[14px] bg-orange-500 py-3.5 text-sm font-bold text-white shadow-[0_4px_12px_-4px_rgba(249,115,22,0.5)] active:scale-[0.98]"
                >
                  Готово
                </button>
              </div>
            ) : (
              <button
                onClick={onAdd}
                className="w-full rounded-[14px] bg-orange-500 py-4 text-[15px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(249,115,22,0.5)] active:scale-[0.98]"
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
    refetchInterval: 15000,
  });

  const router = useRouter();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const catBarRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const isProgrammaticScrollRef = useRef(false);
  const [scrolled, setScrolled] = useState(false);

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

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const qtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line.menuItemId, line.qty);
    return map;
  }, [lines]);

  const groupedItems = useMemo(() => {
    if (!data) return [];
    const query = searchQuery.trim().toLowerCase();
    const filteredItems = query
      ? data.items.filter(
          (item) =>
            item.title.toLowerCase().includes(query) ||
            (item.description ?? "").toLowerCase().includes(query),
        )
      : data.items;

    return data.categories
      .map((category) => {
        const categoryItems = filteredItems.filter((item) => item.categoryId === category.id);
        if (categoryItems.length === 0) return { category, entries: [] as MenuDisplayEntry[] };

        if (category.title !== DRINKS_CATEGORY_TITLE) {
          return {
            category,
            entries: categoryItems.map((item) => ({ type: "item" as const, item })),
          };
        }

        const groupedDrinks = new Map<string, DrinkVariant[]>();
        const entries: MenuDisplayEntry[] = [];

        for (const item of categoryItems) {
          const meta = getDrinkVariantMeta(item.title);
          if (!meta) {
            entries.push({ type: "item", item });
            continue;
          }

          const existingVariants = groupedDrinks.get(meta.baseTitle);
          if (existingVariants) {
            existingVariants.push({ ...item, variantLabel: meta.variantLabel });
            continue;
          }

          groupedDrinks.set(meta.baseTitle, [{ ...item, variantLabel: meta.variantLabel }]);
          entries.push({
            type: "drink-group",
            key: meta.baseTitle,
            title: meta.baseTitle,
            description: "",
            photoUrl: item.photoUrl,
            variants: [],
          });
        }

        return {
          category,
          entries: entries.map((entry) => {
            if (entry.type !== "drink-group") return entry;

            const variants = [...(groupedDrinks.get(entry.key) ?? [])].sort((left, right) => {
              const orderDiff =
                getDrinkVariantSortOrder(left.variantLabel) -
                getDrinkVariantSortOrder(right.variantLabel);
              if (orderDiff !== 0) return orderDiff;
              return left.priceKgs - right.priceKgs;
            });
            const labels = variants.map((variant) => variant.variantLabel);

            return {
              ...entry,
              photoUrl:
                variants.find((variant) => variant.isAvailable)?.photoUrl ??
                variants[0]?.photoUrl ??
                entry.photoUrl,
              variants,
              description:
                labels.length > 1
                  ? `Выберите объем: ${labels.join(", ")}`
                  : `Объем: ${labels[0] ?? "доступен"}`,
            };
          }),
        };
      })
      .filter((entry) => entry.entries.length > 0);
  }, [data, searchQuery]);

  useEffect(() => {
    if (!groupedItems.length) {
      setActiveCat(null);
      return;
    }

    if (!activeCat || !groupedItems.some((entry) => entry.category.id === activeCat)) {
      setActiveCat(groupedItems[0]?.category.id ?? null);
    }
  }, [activeCat, groupedItems]);

  function scrollCategoryChipIntoView(id: string) {
    const bar = catBarRef.current;
    if (!bar) return;
    const button = bar.querySelector<HTMLElement>(`[data-catid="${id}"]`);
    if (button) {
      button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }

  useEffect(() => {
    if (searchQuery || groupedItems.length === 0) return;

    const handleSectionTracking = () => {
      if (isProgrammaticScrollRef.current) return;

      let nextActive = groupedItems[0]?.category.id ?? null;
      for (const entry of groupedItems) {
        const section = sectionRefs.current.get(entry.category.id);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= 180) {
          nextActive = entry.category.id;
        } else {
          break;
        }
      }

      if (nextActive && nextActive !== activeCat) {
        setActiveCat(nextActive);
        scrollCategoryChipIntoView(nextActive);
      }
    };

    handleSectionTracking();
    window.addEventListener("scroll", handleSectionTracking, { passive: true });
    return () => window.removeEventListener("scroll", handleSectionTracking);
  }, [activeCat, groupedItems, searchQuery]);

  function addToCart(item: MenuItem) {
    add({
      menuItemId: item.id,
      title: item.title,
      photoUrl: item.photoUrl,
      priceKgs: item.priceKgs,
    });
  }

  function handleCatClick(id: string) {
    setActiveCat(id);
    setSearchQuery("");
    scrollCategoryChipIntoView(id);

    const section = sectionRefs.current.get(id);
    if (!section) return;

    isProgrammaticScrollRef.current = true;
    window.scrollTo({
      top: section.getBoundingClientRect().top + window.scrollY - 140,
      behavior: "smooth",
    });
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 500);
  }

  return (
    <main className="min-h-screen bg-transparent px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-4">
      <div className="mx-auto max-w-md">
        {/* Scrollable header */}
        <div className="pb-3 pt-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-500">
                {isLoading ? (
                  <span className="inline-block h-3 w-12 rounded bg-gray-100 skeleton" />
                ) : (
                  "Каталог"
                )}
              </div>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-gray-900">
                {data?.restaurant?.name ??
                  (isLoading ? (
                    <span className="inline-block h-9 w-48 rounded-xl bg-gray-100 skeleton" />
                  ) : (
                    "Ресторан"
                  ))}
              </h1>
              <p className="mt-1.5 max-w-[15rem] text-sm text-gray-500">
                Сочные бургеры и горячие заказы с быстрой доставкой.
              </p>
            </div>

            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_16px_34px_-18px_rgba(15,23,42,0.45)]">
              <Image
                src={BRAND_LOGO_SRC}
                alt="Beka's Burger"
                fill
                priority
                sizes="96px"
                className="object-cover"
              />
            </div>
          </div>
        </div>

        {/* Sticky search + categories */}
        <div
          className={`sticky top-0 z-30 -mx-4 px-4 pb-3 pt-3 transition-all duration-200 ${
            scrolled
              ? "border-b border-gray-200/60 bg-[#F5F5F7]/95 backdrop-blur-lg"
              : "bg-transparent"
          }`}
        >
          <div className="relative">
            <svg
              viewBox="0 0 20 20"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
            >
              <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M12.5 12.5L16 16"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Найти блюдо..."
              className="w-full rounded-[14px] border border-gray-200 bg-white px-10 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M6 6l8 8M14 6l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>

          {!searchQuery && (
            <div className="relative mt-3" ref={catBarRef}>
              <div className="no-scrollbar flex snap-x gap-2 overflow-x-auto pb-0.5">
                {isLoading
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-10 w-20 shrink-0 rounded-full bg-gray-100 skeleton"
                      />
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
                              ? "bg-orange-500 text-white shadow-[0_4px_12px_-4px_rgba(249,115,22,0.5)]"
                              : "bg-white text-gray-600 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] hover:bg-gray-50"
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

        {/* Food items list */}
        <div className="mt-3 space-y-6">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <SkeletonItem key={index} delay={index * 60} />
            ))
          ) : isError ? (
            <div className="mt-8 rounded-2xl bg-white px-6 py-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]">
              <div className="text-4xl text-gray-400">:(</div>
              <div className="mt-3 font-bold text-gray-900">Не удалось загрузить меню</div>
              <div className="mt-1 text-sm text-gray-500">
                Проверьте соединение и обновите страницу
              </div>
            </div>
          ) : groupedItems.length === 0 ? (
            <div className="mt-8 rounded-2xl bg-white px-6 py-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]">
              <div className="text-4xl text-gray-400">{searchQuery ? "?" : ":)"}</div>
              <div className="mt-3 text-sm font-semibold text-gray-500">
                {searchQuery
                  ? `По запросу "${searchQuery}" ничего не найдено`
                  : "В этой категории пока нет блюд"}
              </div>
            </div>
          ) : (
            groupedItems.map(({ category, entries }, categoryIndex) => (
              <section
                key={category.id}
                ref={(node) => {
                  if (node) sectionRefs.current.set(category.id, node);
                  else sectionRefs.current.delete(category.id);
                }}
                className="scroll-mt-36"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">{category.title}</h2>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-soft">
                    {entries.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {entries.map((entry, itemIndex) => {
                    const animationIndex = categoryIndex * 3 + itemIndex;
                    if (entry.type !== "item") {
                      return (
                        <DrinkGroupCard
                          key={entry.key}
                          title={entry.title}
                          description={entry.description}
                          photoUrl={entry.photoUrl}
                          variants={entry.variants}
                          animationDelay={Math.min(animationIndex * 45, 280)}
                          qtyMap={qtyMap}
                          onOpen={setSelectedItem}
                          onAdd={addToCart}
                          onInc={inc}
                          onDec={dec}
                        />
                      );
                    }

                    const item = entry.item;
                    const qty = qtyMap.get(item.id) ?? 0;

                    return (
                      <div
                        key={item.id}
                        className="motion-fade-up flex gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)] transition-transform duration-200 hover:-translate-y-0.5"
                        style={{ animationDelay: `${Math.min(animationIndex * 45, 280)}ms` }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          onMouseEnter={() => warmImage(item.photoUrl)}
                          onTouchStart={() => warmImage(item.photoUrl)}
                          onFocus={() => warmImage(item.photoUrl)}
                          className="shrink-0 focus:outline-none"
                          aria-label={`Подробнее: ${item.title}`}
                        >
                          <div className="relative h-[100px] w-[100px] overflow-hidden rounded-xl bg-gray-100 transition-transform duration-200 active:scale-95">
                            <Image
                              src={item.photoUrl}
                              alt={item.title}
                              fill
                              className="object-cover"
                              sizes="100px"
                            />
                            {!item.isAvailable && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur">
                                <span className="px-2 text-center text-[10px] font-bold leading-tight text-gray-500">
                                  НЕТ В НАЛИЧИИ
                                </span>
                              </div>
                            )}
                          </div>
                        </button>

                        <div className="flex min-w-0 flex-1 flex-col">
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            onMouseEnter={() => warmImage(item.photoUrl)}
                            onTouchStart={() => warmImage(item.photoUrl)}
                            onFocus={() => warmImage(item.photoUrl)}
                            className="min-w-0 text-left focus:outline-none"
                          >
                            <div
                              className="text-[15px] font-bold leading-snug text-gray-900"
                              style={{ ...clamp2(), WebkitLineClamp: 1 }}
                            >
                              {item.title}
                            </div>
                            {item.description ? (
                              <div
                                className="mt-1 text-[13px] leading-snug text-gray-500"
                                style={clamp2()}
                              >
                                {item.description}
                              </div>
                            ) : null}
                          </button>

                          <div className="mt-auto flex items-center justify-between pt-3">
                            <div className="text-[16px] font-bold text-orange-500">
                              {formatKgs(item.priceKgs)}
                            </div>
                            {item.isAvailable &&
                              (qty > 0 ? (
                                <QtyStepper
                                  qty={qty}
                                  onDec={() => dec(item.id)}
                                  onInc={() => inc(item.id)}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addToCart(item)}
                                  className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-xl font-bold text-white shadow-[0_4px_12px_-4px_rgba(249,115,22,0.5)] active:scale-90"
                                  aria-label={`Добавить ${item.title}`}
                                >
                                  +
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
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
