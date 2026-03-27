import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { listMenuItemsByRestaurant } from "@/lib/menuItemCompat";
import { prisma } from "@/lib/prisma";
import { getRestaurantDisplayName } from "@/lib/restaurant";

export async function GET(req: Request) {
  const auth = await requireAdminRole(["owner", "operator"]);
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Требуется slug ресторана" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      categories: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, sortOrder: true },
      },
    },
  });
  if (!restaurant) return NextResponse.json({ error: "Ресторан не найден" }, { status: 404 });

  const items = await listMenuItemsByRestaurant(restaurant.id);

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
  });
}
