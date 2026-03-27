import { prisma } from "@/lib/prisma";

export const DEFAULT_RESTAURANT_NAME = "Beka's Burger";
const LEGACY_RESTAURANT_NAME = "Dordoi Food";
const DEFAULT_SLUG = "dordoi-food";
const DEFAULT_QR_IMAGE = "/qr/demo-restaurant.png";

export function getRestaurantDisplayName(name: string | null | undefined) {
  const normalized = (name ?? "").trim();
  if (!normalized || normalized === LEGACY_RESTAURANT_NAME) return DEFAULT_RESTAURANT_NAME;
  return normalized;
}

export async function ensureActiveRestaurant() {
  const active = await prisma.restaurant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (active) {
    if (active.name === LEGACY_RESTAURANT_NAME) {
      return prisma.restaurant.update({
        where: { id: active.id },
        data: { name: DEFAULT_RESTAURANT_NAME },
      });
    }
    return active;
  }

  const firstExisting = await prisma.restaurant.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (firstExisting) {
    return prisma.restaurant.update({
      where: { id: firstExisting.id },
      data: {
        isActive: true,
        name: getRestaurantDisplayName(firstExisting.name),
      },
    });
  }

  const appName = (process.env.NEXT_PUBLIC_APP_NAME || DEFAULT_RESTAURANT_NAME).trim();
  return prisma.restaurant.create({
    data: {
      slug: DEFAULT_SLUG,
      name: appName || DEFAULT_RESTAURANT_NAME,
      qrImageUrl: DEFAULT_QR_IMAGE,
      isActive: true,
    },
  });
}
