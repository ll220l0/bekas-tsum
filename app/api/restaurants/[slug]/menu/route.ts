import { NextResponse } from "next/server";
import { getBusinessHoursStatus } from "@/lib/businessHours";
import { listMenuItemsByRestaurant } from "@/lib/menuItemCompat";
import { prisma } from "@/lib/prisma";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export const revalidate = 60;

async function findRestaurantBySlug(slug: string) {
  return prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      categories: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, sortOrder: true },
      },
    },
  });
}

async function findFirstActiveRestaurant() {
  return prisma.restaurant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      categories: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, sortOrder: true },
      },
    },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bySlug = await findRestaurantBySlug(slug);

  const restaurant = bySlug && bySlug.isActive ? bySlug : await findFirstActiveRestaurant();

  if (!restaurant) return NextResponse.json({ error: "Ресторан не найден" }, { status: 404 });

  const items = await listMenuItemsByRestaurant(restaurant.id);
  const businessHours = getBusinessHoursStatus();

  return NextResponse.json({
    restaurant: {
      id: restaurant.id,
      name: getRestaurantDisplayName(restaurant.name),
      slug: restaurant.slug,
    },
    categories: restaurant.categories.map((c) => ({
      id: c.id,
      title: c.title,
      sortOrder: c.sortOrder,
    })),
    items: items.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      title: i.title,
      variantGroupId: i.variantGroupId,
      variantGroupTitle: i.variantGroupTitle,
      variantLabel: i.variantLabel,
      description: i.description ?? "",
      photoUrl: i.photoUrl,
      priceKgs: i.priceKgs,
      isAvailable: i.isAvailable,
      sortOrder: i.sortOrder,
    })),
    businessHours,
  });
}
