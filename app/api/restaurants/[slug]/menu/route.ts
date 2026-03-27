import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bySlug = await prisma.restaurant.findUnique({
    where: { slug },
    include: {
      categories: { orderBy: { sortOrder: "asc" } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });

  const restaurant =
    bySlug && bySlug.isActive
      ? bySlug
      : await prisma.restaurant.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          include: {
            categories: { orderBy: { sortOrder: "asc" } },
            items: { orderBy: { sortOrder: "asc" } },
          },
        });

  if (!restaurant) return NextResponse.json({ error: "Ресторан не найден" }, { status: 404 });

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
    items: restaurant.items.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      title: i.title,
      description: i.description ?? "",
      photoUrl: i.photoUrl,
      priceKgs: i.priceKgs,
      isAvailable: i.isAvailable,
      sortOrder: i.sortOrder,
    })),
  });
}
