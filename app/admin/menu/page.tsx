"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Photo } from "@/components/ui";
import { formatKgs } from "@/lib/money";

type Restaurant = {
  id: string;
  name: string;
  slug: string;
};
type Category = { id: string; title: string; sortOrder: number };
type Item = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  photoUrl: string;
  priceKgs: number;
  isAvailable: boolean;
};
type AvailabilityFilter = "all" | "available" | "hidden";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ошибка";
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Сервер вернул некорректный ответ");
  }
}

async function resizeImage(file: File) {
  const url = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Не удалось обработать изображение"));
      image.src = url;
    });

    const target = 900;
    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Холст недоступен");

    const minSide = Math.min(img.width, img.height);
    const sx = (img.width - minSide) / 2;
    const sy = (img.height - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, target, target);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Не удалось сжать изображение"))),
        "image/webp",
        0.9,
      );
    });

    return new File([blob], `${Date.now()}.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AdminMenuPage() {
  const [restaurantSlug, setRestaurantSlug] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");

  const [catTitle, setCatTitle] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemPhoto, setItemPhoto] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemAvail, setItemAvail] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    open: false,
    message: "",
    onConfirm: () => {},
  });

  const loadRestaurants = useCallback(async () => {
    const res = await fetch("/api/admin/restaurants", { cache: "no-store" });
    const j = (await res.json()) as { restaurants?: Restaurant[] };
    const first = j.restaurants?.[0];
    if (first) {
      setRestaurantSlug((current) => current || first.slug);
    }
  }, []);

  const loadMenu = useCallback(async (slug: string) => {
    const res = await fetch(`/api/admin/menu?slug=${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    const j = (await res.json()) as { categories?: Category[]; items?: Item[] };
    const nextCategories = j.categories ?? [];
    setCategories(nextCategories);
    setItems(j.items ?? []);
    setItemCategoryId((current) => current || nextCategories[0]?.id || "");
  }, []);

  useEffect(() => {
    void loadRestaurants();
  }, [loadRestaurants]);

  useEffect(() => {
    if (!restaurantSlug) return;
    void loadMenu(restaurantSlug);
  }, [restaurantSlug, loadMenu]);

  useEffect(() => {
    if (filterCategoryId !== "all" && !categories.some((x) => x.id === filterCategoryId)) {
      setFilterCategoryId("all");
    }
  }, [categories, filterCategoryId]);

  const categoryItemCount = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const item of items) {
      countMap.set(item.categoryId, (countMap.get(item.categoryId) ?? 0) + 1);
    }
    return countMap;
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (filterCategoryId !== "all" && item.categoryId !== filterCategoryId) return false;
      if (availabilityFilter === "available" && !item.isAvailable) return false;
      if (availabilityFilter === "hidden" && item.isAvailable) return false;
      if (!query) return true;
      const haystack = `${item.title} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [availabilityFilter, filterCategoryId, items, searchQuery]);

  const groupedItems = useMemo(
    () =>
      categories
        .map((category) => ({
          category,
          items: filteredItems.filter((item) => item.categoryId === category.id),
        }))
        .filter((entry) => (filterCategoryId === "all" ? entry.items.length > 0 : true)),
    [categories, filteredItems, filterCategoryId],
  );

  function resetItemForm() {
    setItemId(null);
    setItemTitle("");
    setItemDesc("");
    setItemPhoto("");
    setItemPrice("");
    setItemAvail(true);
    setItemCategoryId(categories[0]?.id ?? "");
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const resized = await resizeImage(file);
      const formData = new FormData();
      formData.append("file", resized);

      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const j = await readJsonSafely<{ url?: string; error?: string }>(res);
      if (!res.ok || !j?.url) throw new Error(j?.error ?? "Не удалось загрузить фото");

      setItemPhoto(j.url);
      toast.success("Фото загружено");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function createCategory() {
    if (!catTitle.trim()) return;
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurantSlug,
          title: catTitle.trim(),
          sortOrder: categories.length + 1,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Ошибка");
      toast.success("Категория создана");
      setCatTitle("");
      await loadMenu(restaurantSlug);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  }

  function deleteCategory(id: string) {
    const cat = categories.find((c) => c.id === id);
    const count = categoryItemCount.get(id) ?? 0;
    setConfirmDialog({
      open: true,
      message: `Удалить категорию "${cat?.title ?? ""}" вместе с ${count} блюд${count === 1 ? "ом" : count < 5 ? "ами" : "ами"}?`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) toast.error(j.error ?? "Ошибка");
        else toast.success("Удалено");
        await loadMenu(restaurantSlug);
      },
    });
  }

  async function upsertItem() {
    if (!itemCategoryId) {
      toast.error("Выбери категорию");
      return;
    }
    if (!itemPrice.trim()) {
      toast.error("Укажите цену");
      return;
    }

    try {
      const payload = {
        id: itemId ?? undefined,
        restaurantSlug,
        categoryId: itemCategoryId,
        title: itemTitle.trim(),
        description: itemDesc.trim(),
        photoUrl: itemPhoto,
        priceKgs: Number(itemPrice),
        isAvailable: Boolean(itemAvail),
      };

      const res = await fetch("/api/admin/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Ошибка");

      toast.success(itemId ? "Блюдо обновлено" : "Блюдо создано");
      resetItemForm();
      setItemModalOpen(false);
      await loadMenu(restaurantSlug);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  }

  async function toggleAvailability(id: string, isAvailable: boolean) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, isAvailable } : item)),
    );

    const res = await fetch(`/api/admin/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isAvailable }),
    });

    if (!res.ok) {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, isAvailable: !isAvailable } : item)),
      );
      toast.error("Не удалось обновить наличие");
    }
  }

  function deleteItem(id: string) {
    const item = items.find((x) => x.id === id);
    setConfirmDialog({
      open: true,
      message: `Удалить блюдо "${item?.title ?? ""}"?`,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/items/${id}`, { method: "DELETE" });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) toast.error(j.error ?? "Ошибка");
        else toast.success("Удалено");
        await loadMenu(restaurantSlug);
      },
    });
  }

  function editItem(item: Item) {
    setItemId(item.id);
    setItemCategoryId(item.categoryId);
    setItemTitle(item.title);
    setItemDesc(item.description ?? "");
    setItemPhoto(item.photoUrl);
    setItemPrice(String(item.priceKgs));
    setItemAvail(item.isAvailable);
    setItemModalOpen(true);
  }

  function openCreateItemModal() {
    resetItemForm();
    if (filterCategoryId !== "all") {
      setItemCategoryId(filterCategoryId);
    }
    setItemModalOpen(true);
  }

  const closeItemModal = useCallback(() => {
    if (uploadingPhoto) return;
    setItemModalOpen(false);
  }, [uploadingPhoto]);

  useEffect(() => {
    if (!itemModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeItemModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeItemModal, itemModalOpen]);

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-black/50">Админка</div>
            <div className="text-2xl font-extrabold sm:text-3xl">Редактор меню</div>
          </div>
          <Link className="text-sm text-black/60 underline" href="/admin">
            Назад
          </Link>
        </div>

        <div className="mt-5 space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                className="h-10 w-full px-4 sm:w-auto"
                onClick={openCreateItemModal}
                disabled={categories.length === 0}
              >
                + Новое блюдо
              </Button>
              <button
                type="button"
                aria-expanded={categoriesOpen}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 transition-[background-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/5 hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:w-auto"
                onClick={() => setCategoriesOpen((prev) => !prev)}
              >
                Категории
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/5 text-black/70 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    categoriesOpen ? "rotate-180" : "rotate-0"
                  }`}
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <path
                      d="M5.5 7.5L10 12.5L14.5 7.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
              <div className="flex w-full flex-wrap items-center gap-2 text-xs sm:ml-auto sm:w-auto">
                <span className="rounded-full border border-black/10 bg-white px-2 py-1 text-black/65">
                  Категорий: {categories.length}
                </span>
                <span className="rounded-full border border-black/10 bg-white px-2 py-1 text-black/65">
                  Блюд: {items.length}
                </span>
                <span className="rounded-full border border-black/10 bg-white px-2 py-1 text-black/65">
                  В выдаче: {filteredItems.length}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
              <input
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-3"
                placeholder="Поиск по названию или описанию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-3"
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(e.target.value)}
              >
                <option value="all">Все категории</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title} ({categoryItemCount.get(category.id) ?? 0})
                  </option>
                ))}
              </select>
              <div className="inline-flex w-full flex-wrap rounded-xl border border-black/10 bg-white p-1 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setAvailabilityFilter("all")}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${availabilityFilter === "all" ? "bg-black text-white" : "text-black/65"}`}
                >
                  Все
                </button>
                <button
                  type="button"
                  onClick={() => setAvailabilityFilter("available")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    availabilityFilter === "available"
                      ? "bg-emerald-600 text-white"
                      : "text-black/65"
                  } flex-1`}
                >
                  В наличии
                </button>
                <button
                  type="button"
                  onClick={() => setAvailabilityFilter("hidden")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    availabilityFilter === "hidden" ? "bg-rose-600 text-white" : "text-black/65"
                  } flex-1`}
                >
                  Скрытые
                </button>
              </div>
            </div>
          </Card>

          {categoriesOpen && (
            <Card className="p-4">
              <div className="space-y-2">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="break-words font-semibold">{category.title}</span>
                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/60">
                        {categoryItemCount.get(category.id) ?? 0} блюд
                      </span>
                    </div>
                    <button
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                      onClick={() => void deleteCategory(category.id)}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className="min-w-[220px] flex-1 rounded-xl border border-black/10 bg-white px-3 py-3"
                  placeholder="Новая категория"
                  value={catTitle}
                  onChange={(e) => setCatTitle(e.target.value)}
                />
                <Button
                  className="h-11 w-full px-4 sm:w-auto"
                  onClick={() => void createCategory()}
                  disabled={!catTitle.trim() || !restaurantSlug}
                >
                  Создать категорию
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-black/50">Превью клиентского меню</div>
              {searchQuery.trim().length > 0 && (
                <button
                  className="text-xs text-black/55 underline"
                  onClick={() => setSearchQuery("")}
                >
                  Очистить поиск
                </button>
              )}
            </div>
            <div className="mt-3 space-y-6">
              {groupedItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/20 bg-white/70 p-8 text-center text-sm text-black/55">
                  По текущим фильтрам блюд не найдено.
                </div>
              ) : (
                groupedItems.map(({ category, items: categoryItems }) => (
                  <section key={category.id}>
                    <div className="flex items-center justify-between">
                      <div className="text-xl font-bold">{category.title}</div>
                      <span className="rounded-full border border-black/10 bg-white px-2 py-1 text-xs font-semibold text-black/60">
                        {categoryItems.length} шт.
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {categoryItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-black/10 bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                        >
                          <div className="flex gap-3">
                            <Photo src={item.photoUrl} alt={item.title} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[15px] font-semibold leading-snug break-words">
                                    {item.title}
                                  </div>
                                  <div className="mt-1 text-sm text-black/55 break-words">
                                    {item.description}
                                  </div>
                                </div>
                                <div className="shrink-0 whitespace-nowrap text-right text-[15px] font-extrabold">
                                  {formatKgs(item.priceKgs)}
                                </div>
                              </div>

                              <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-2 py-1.5 text-sm">
                                  <span className="text-black/60">Наличие</span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={item.isAvailable}
                                    onClick={() =>
                                      void toggleAvailability(item.id, !item.isAvailable)
                                    }
                                    className={`relative h-7 w-12 rounded-full transition ${item.isAvailable ? "bg-emerald-500" : "bg-slate-300"}`}
                                  >
                                    <span
                                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${
                                        item.isAvailable ? "left-[1.35rem]" : "left-0.5"
                                      }`}
                                    />
                                  </button>
                                  <span
                                    className={`font-semibold ${item.isAvailable ? "text-emerald-700" : "text-rose-700"}`}
                                  >
                                    {item.isAvailable ? "В наличии" : "Скрыто"}
                                  </span>
                                </label>

                                <div className="flex w-full justify-center gap-2 sm:w-auto">
                                  <button
                                    className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-black/75 transition hover:bg-black/5"
                                    onClick={() => editItem(item)}
                                  >
                                    Редактировать
                                  </button>
                                  <button
                                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                                    onClick={() => void deleteItem(item.id)}
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <button
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            aria-label="Закрыть окно блюда"
            onClick={closeItemModal}
          />

          <Card className="motion-pop relative z-10 w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-lg font-extrabold">
                  {itemId ? "Редактирование блюда" : "Новое блюдо"}
                </div>
                <div className="mt-1 text-xs text-black/55">
                  Заполните поля и сразу проверьте предпросмотр справа.
                </div>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                {itemId && (
                  <button
                    className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black/70 sm:flex-none"
                    onClick={resetItemForm}
                  >
                    Сброс
                  </button>
                )}
                <button
                  className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black/70 sm:flex-none"
                  onClick={closeItemModal}
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-2">
                <select
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-3"
                  value={itemCategoryId}
                  onChange={(e) => setItemCategoryId(e.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-3"
                  placeholder="Название блюда"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-3"
                  placeholder="Описание"
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <input
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-3"
                    type="text"
                    inputMode="numeric"
                    placeholder="цена"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value.replace(/[^\d]/g, ""))}
                  />
                  <div className="shrink-0 rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-semibold text-black/70">
                    сом
                  </div>
                </div>
                <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-white/80 bg-gradient-to-b from-white to-slate-50 p-3 text-sm shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
                  <span className="inline-flex items-center rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
                    + Фото
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadPhoto(file);
                    }}
                  />
                </label>
                <label className="inline-flex w-fit items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
                  <span className="text-black/60">Наличие</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={itemAvail}
                    onClick={() => setItemAvail((prev) => !prev)}
                    className={`relative h-7 w-12 rounded-full transition ${itemAvail ? "bg-emerald-500" : "bg-slate-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${itemAvail ? "left-[1.35rem]" : "left-0.5"}`}
                    />
                  </button>
                  <span
                    className={`font-semibold ${itemAvail ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {itemAvail ? "В наличии" : "Скрыто"}
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
                  Предпросмотр
                </div>
                <div className="rounded-2xl border border-black/10 bg-white p-3">
                  {itemPhoto ? (
                    <div className="relative h-36 overflow-hidden rounded-xl border border-black/10 bg-black/5">
                      <Image
                        src={itemPhoto}
                        alt="Предпросмотр"
                        fill
                        className="object-cover"
                        sizes="240px"
                      />
                    </div>
                  ) : (
                    <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-black/20 bg-black/5 text-xs text-black/45">
                      Фото не выбрано
                    </div>
                  )}
                  <div className="mt-2">
                    <div className="text-sm font-semibold break-words">
                      {itemTitle || "Название блюда"}
                    </div>
                    <div className="mt-1 text-xs text-black/55 break-words">
                      {itemDesc || "Короткое описание блюда"}
                    </div>
                    <div className="mt-2 text-sm font-extrabold">
                      {formatKgs(Number(itemPrice) || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={closeItemModal}
                disabled={uploadingPhoto}
              >
                Отмена
              </Button>
              <Button
                className="flex-1"
                disabled={
                  !restaurantSlug ||
                  !itemCategoryId ||
                  !itemTitle.trim() ||
                  !itemPhoto ||
                  !itemPrice.trim() ||
                  uploadingPhoto
                }
                onClick={() => void upsertItem()}
              >
                {uploadingPhoto
                  ? "Загружаем фото..."
                  : itemId
                    ? "Сохранить блюдо"
                    : "Создать блюдо"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {confirmDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <button
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Закрыть"
            onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-black/10 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="text-lg font-bold">Подтвердите удаление</div>
            <div className="mt-2 text-sm text-black/65">{confirmDialog.message}</div>
            <div className="mt-5 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1 h-11 py-0"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
              >
                Отмена
              </Button>
              <Button
                className="flex-1 h-11 py-0 bg-rose-600 hover:bg-rose-700 text-white"
                onClick={() => {
                  setConfirmDialog((prev) => ({ ...prev, open: false }));
                  void confirmDialog.onConfirm();
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
