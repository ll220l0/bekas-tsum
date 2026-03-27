import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import {
  countMenuItemsInVariantGroup,
  createSingleMenuItem,
  getMenuItemById,
  isVariantFieldsMissingError,
  listMenuItemsByIds,
  listMenuItemsByVariantGroup,
  updateSingleMenuItem,
} from "@/lib/menuItemCompat";
import { buildVariantItemTitle, normalizeVariantLabel } from "@/lib/menuVariants";
import { prisma } from "@/lib/prisma";
import { UpsertItemSchema } from "@/lib/validators";

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

async function getNextSortOrder(categoryId: string) {
  const maxSort = await prisma.menuItem.aggregate({
    where: { categoryId },
    _max: { sortOrder: true },
  });

  return (maxSort._max.sortOrder ?? 0) + 1;
}

export async function POST(req: Request) {
  const auth = await requireAdminRole(["owner", "operator"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = UpsertItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные запроса", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: parsed.data.restaurantSlug },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Ресторан не найден" }, { status: 404 });
  }

  const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category || category.restaurantId !== restaurant.id) {
    return NextResponse.json({ error: "Некорректная категория" }, { status: 400 });
  }

  if (parsed.data.mode === "single") {
    const { id, title, description, photoUrl, priceKgs, isAvailable, sortOrder } = parsed.data;
    const cleanTitle = title.trim();

    if (id) {
      const existing = await getMenuItemById(id);
      if (!existing || existing.restaurantId !== restaurant.id) {
        return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });
      }

      if (existing.variantGroupId) {
        const siblingsCount = await countMenuItemsInVariantGroup(existing.variantGroupId);
        if (siblingsCount > 1) {
          return NextResponse.json(
            { error: "Эту позицию нужно редактировать как модель с вариантами" },
            { status: 400 },
          );
        }
      }

      const updated = await updateSingleMenuItem(id, {
        categoryId: parsed.data.categoryId,
        title: cleanTitle,
        description: description || null,
        photoUrl,
        priceKgs,
        isAvailable,
        variantGroupId: null,
        variantGroupTitle: null,
        variantLabel: null,
      });

      return NextResponse.json({ ok: true, item: updated });
    }

    const created = await createSingleMenuItem({
      restaurantId: restaurant.id,
      categoryId: parsed.data.categoryId,
      title: cleanTitle,
      description: description || null,
      photoUrl,
      priceKgs,
      isAvailable,
      sortOrder: sortOrder ?? (await getNextSortOrder(parsed.data.categoryId)),
      variantGroupId: null,
      variantGroupTitle: null,
      variantLabel: null,
    });

    return NextResponse.json({ ok: true, item: created });
  }

  const variantPayload = parsed.data;
  const cleanGroupTitle = variantPayload.title.trim();
  const sourceItemIds = uniqueIds([
    ...(variantPayload.sourceItemIds ?? []),
    ...variantPayload.variants.flatMap((variant) => (variant.id ? [variant.id] : [])),
  ]);

  try {
    const [sourceItems, existingGroupItems] = await Promise.all([
      sourceItemIds.length
        ? listMenuItemsByIds(restaurant.id, sourceItemIds)
        : Promise.resolve([]),
      variantPayload.groupId
        ? listMenuItemsByVariantGroup(restaurant.id, variantPayload.groupId)
        : Promise.resolve([]),
    ]);

    if (sourceItems.length !== sourceItemIds.length) {
      return NextResponse.json({ error: "Часть вариантов не найдена" }, { status: 404 });
    }

    const editableMap = new Map<string, (typeof sourceItems)[number]>();
    for (const item of [...sourceItems, ...existingGroupItems]) editableMap.set(item.id, item);

    for (const variant of variantPayload.variants) {
      if (variant.id && !editableMap.has(variant.id)) {
        return NextResponse.json({ error: "Вариант не найден" }, { status: 404 });
      }
    }

    const keptVariantIds = new Set(
      variantPayload.variants.flatMap((variant) => (variant.id ? [variant.id] : [])),
    );
    const removableItems = Array.from(editableMap.values()).filter(
      (item) => !keptVariantIds.has(item.id),
    );

    if (removableItems.length > 0) {
      const ordersCount = await prisma.orderItem.count({
        where: { menuItemId: { in: removableItems.map((item) => item.id) } },
      });
      if (ordersCount > 0) {
        return NextResponse.json(
          {
            error:
              "Нельзя удалить вариант с историей заказов. Оставьте его в модели или скройте через наличие.",
          },
          { status: 409 },
        );
      }
    }

    const groupId = parsed.data.groupId || `vg_${randomUUID()}`;
    let nextSortOrder = await getNextSortOrder(variantPayload.categoryId);

    const savedItems = await prisma.$transaction(async (tx) => {
      const result = [];

      for (const variant of variantPayload.variants) {
        const variantLabel = normalizeVariantLabel(variant.label);
        const title = buildVariantItemTitle(cleanGroupTitle, variantLabel);

        if (variant.id) {
          const updated = await tx.menuItem.update({
            where: { id: variant.id },
            data: {
              categoryId: variantPayload.categoryId,
              title,
              variantGroupId: groupId,
              variantGroupTitle: cleanGroupTitle,
              variantLabel,
              description: variantPayload.description || null,
              photoUrl: variantPayload.photoUrl,
              priceKgs: variant.priceKgs,
              isAvailable: variant.isAvailable,
            },
          });
          result.push(updated);
          continue;
        }

        const created = await tx.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: variantPayload.categoryId,
            title,
            variantGroupId: groupId,
            variantGroupTitle: cleanGroupTitle,
            variantLabel,
            description: variantPayload.description || null,
            photoUrl: variantPayload.photoUrl,
            priceKgs: variant.priceKgs,
            isAvailable: variant.isAvailable,
            sortOrder: nextSortOrder++,
          },
        });
        result.push(created);
      }

      if (removableItems.length > 0) {
        await tx.menuItem.deleteMany({
          where: { id: { in: removableItems.map((item) => item.id) } },
        });
      }

      return result;
    });

    return NextResponse.json({ ok: true, groupId, items: savedItems });
  } catch (error) {
    if (isVariantFieldsMissingError(error)) {
      return NextResponse.json(
        {
          error:
            "Для моделей с вариантами нужно применить миграцию базы. Обычные позиции уже работают, но для вариантов выполните prisma migrate deploy.",
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
